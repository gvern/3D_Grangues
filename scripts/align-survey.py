#!/usr/bin/env python3
"""Fit a local scan to Grangues from paired controls; retain independent checks.

Input: {targetSpace: 'EPSG:2154-ENH'|'project-local', verticalDatumVerified: bool,
        points: [{id, kind: 'control'|'check', source: [x,y,z], target: [a,b,c]}]}
Source coordinates must already be rebased, in metres. No ICP or nonrigid warping.
"""
import argparse
import json
from pathlib import Path
import numpy as np

ORIGIN = np.array([477616.19, 6910397.86, 112.79], dtype=np.float64)

def fit_registration(data, allow_scale=False, max_fit_rms=0.05, max_check_error=0.10):
    if not np.isfinite([max_fit_rms, max_check_error]).all() or min(max_fit_rms, max_check_error) <= 0:
        raise ValueError('Positive finite residual thresholds are required.')
    if data.get('targetSpace') not in ('EPSG:2154-ENH', 'project-local'):
        raise ValueError('Declare targetSpace explicitly; the CRS is never inferred.')
    rows = data.get('points', [])
    if len(rows) < 3 or len(rows) > 10000:
        raise ValueError('Provide at least three paired points.')
    ids = [p.get('id') for p in rows]
    if any(not isinstance(i, str) or not i for i in ids) or len(set(ids)) != len(ids):
        raise ValueError('Point IDs must be unique nonempty strings.')
    if any(p.get('kind') not in ('control', 'check') for p in rows):
        raise ValueError('Separate control points and independent check points.')
    source = np.array([p['source'] for p in rows], dtype=np.float64)
    target = np.array([p['target'] for p in rows], dtype=np.float64)
    if source.shape != (len(rows), 3) or target.shape != source.shape or not np.isfinite(source).all() or not np.isfinite(target).all():
        raise ValueError('Points must contain three finite coordinates.')
    if np.abs(source).max() > 10000:
        raise ValueError('Rebase the scan before fitting; source coordinates must be local metres.')
    if data['targetSpace'] == 'EPSG:2154-ENH':
        delta = target - ORIGIN
        target = np.column_stack((delta[:,0], delta[:,2], -delta[:,1]))
    if np.abs(target).max() > 10000:
        raise ValueError('Target points lie outside the project frame; verify the declared CRS.')
    controls = np.array([p['kind'] == 'control' for p in rows])
    if controls.sum() < 3:
        raise ValueError('At least three control points are required, excluding check points.')
    x, y = source[controls], target[controls]
    mx, my = x.mean(axis=0), y.mean(axis=0)
    a, b = x-mx, y-my
    for points in (a,b):
        singular = np.linalg.svd(points, compute_uv=False)
        if singular[0] < 1e-8 or singular[1]/singular[0] < 1e-4:
            raise ValueError('Control points are coincident or nearly collinear.')
    u, singular, vt = np.linalg.svd(a.T @ b)
    correction = np.eye(3)
    correction[2,2] = np.sign(np.linalg.det(vt.T @ u.T))
    rotation = vt.T @ correction @ u.T
    scale = float(np.sum(singular * np.diag(correction))/np.sum(a*a)) if allow_scale else 1.0
    if not 0.001 <= scale <= 1000:
        raise ValueError('Implausible scale; verify source units.')
    translation = my-scale*rotation@mx
    matrix = np.eye(4)
    matrix[:3,:3] = scale*rotation
    matrix[:3,3] = translation
    residuals = np.linalg.norm(source @ (scale*rotation).T+translation-target, axis=1)
    fit_rms = float(np.sqrt(np.mean(residuals[controls]**2)))
    checks = residuals[~controls]
    check_rms = float(np.sqrt(np.mean(checks**2))) if checks.size else None
    check_max = float(checks.max()) if checks.size else None
    checked = (fit_rms <= max_fit_rms and checks.size >= 2 and check_max <= max_check_error
               and data.get('verticalDatumVerified') is True)
    return {
        'coordinateSpace': 'local-meters',
        'sourceToWorld': matrix.flatten(order='F').tolist(),
        'matrixOrder': 'column-major',
        'registration': {
            'status': 'checked' if checked else 'unverified',
            'method': 'paired-points-similarity' if allow_scale else 'paired-points-rigid',
            'scale': scale, 'fitRmsMetres': fit_rms,
            'checkRmsMetres': check_rms, 'checkMaxMetres': check_max,
            'controlCount': int(controls.sum()), 'checkCount': int(checks.size),
            'verticalDatumVerified': data.get('verticalDatumVerified') is True,
            'thresholds': {'fitRmsMetres': max_fit_rms, 'checkMaxMetres': max_check_error},
            'residuals': [{'id':p['id'],'kind':p['kind'],'metres':float(r)} for p,r in zip(rows,residuals)],
            'note': 'Residuals describe this fit, not the absolute accuracy of the survey.',
        },
    }

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('controls', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--allow-scale', action='store_true')
    parser.add_argument('--max-fit-rms', type=float, default=0.05)
    parser.add_argument('--max-check-error', type=float, default=0.10)
    args = parser.parse_args()
    try:
        result = fit_registration(json.loads(args.controls.read_text()), args.allow_scale, args.max_fit_rms, args.max_check_error)
        args.out.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
        print(json.dumps({k:v for k,v in result['registration'].items() if k!='residuals'}, indent=2))
    except (ValueError, KeyError, TypeError) as error:
        parser.error(str(error))
