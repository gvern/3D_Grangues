// Renderer-independent lifecycle: one active capture, cancellation, explicit fallback.
import { PROFILES, variantFor } from './manifest.js';

export class SurveySession {
  constructor({load,onChange=()=>{}}) {
    this.load = load; this.onChange = onChange;
    this.profile = 'mobile'; this.manifest = null;
    this.active = null; this.pending = null; this.candidate = null; this.epoch = 0;
    this.state = {status:'model',source:null,error:null};
  }
  emit(status,source=null,error=null) {
    this.state = {status,source,error}; this.onChange(this.state);
  }
  cancel() {
    this.epoch++;
    this.pending?.abort(); this.pending = null;
    this.candidate?.dispose(); this.candidate = null;
    this.active?.handle.dispose(); this.active = null;
  }
  setManifest(manifest) { this.cancel(); this.manifest=manifest; this.emit('model'); }
  toModel() { this.cancel(); this.emit('model'); }
  async setProfile(profile) {
    if (!PROFILES[profile]) throw new Error('Profil inconnu.');
    if (this.state.source && !variantFor(this.state.source,profile)) throw new Error('Préparer une version légère avant de changer de profil.');
    const id = this.state.source?.id; this.profile = profile;
    if (id) return this.select(id);
    return false;
  }
  async select(id) {
    const source = this.manifest?.sources.find(s=>s.id===id);
    if (!source || source.availability!=='ready') throw new Error('Ce relevé n’est pas encore disponible.');
    const variant = variantFor(source,this.profile);
    if (!variant) throw new Error('Une version légère de ce relevé doit être préparée pour le profil économe.');
    this.cancel();
    const epoch = this.epoch, controller = new AbortController();
    this.pending = controller;
    this.emit('loading',source);
    let handle;
    try {
      handle = await this.load(source,variant,PROFILES[this.profile],controller.signal);
      if (epoch!==this.epoch || controller.signal.aborted) { handle.dispose(); return false; }
      this.candidate = handle;
      await handle.ready;
      if (epoch!==this.epoch || controller.signal.aborted) { handle.dispose(); return false; }
      this.candidate = null;
      this.pending = null;
      this.active = {source,handle}; this.emit('ready',source);
      return true;
    } catch(error) {
      handle?.dispose();
      if (epoch!==this.epoch || controller.signal.aborted) return false;
      this.candidate = null; this.pending = null; this.emit('error',source,error.message || 'Chargement impossible.');
      return false;
    }
  }
  update() {
    if (!this.active && !this.candidate) return;
    try { (this.active?.handle || this.candidate).update?.(); }
    catch(error) { const source=this.state.source; this.cancel(); this.emit('error',source,error.message); }
  }
  dispose() { this.cancel(); }
}
