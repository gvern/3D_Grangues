"""Tests for scripts/align-survey.py's fit_registration(). Run with
`python3 -m unittest discover -s tests -p 'test_*.py'` (or `npm run
test:alignment`). Requires numpy (`pip install numpy`).
"""
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))

import numpy as np

from importlib import import_module
align_survey = import_module('align-survey')
fit_registration = align_survey.fit_registration
ORIGIN = align_survey.ORIGIN


def rotation_y(theta):
    c, s = math.cos(theta), math.sin(theta)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def make_points(rotation, scale, translation, sources, kinds=None, target_space='project-local', vertical_verified=True):
    points = []
    for i, src in enumerate(sources):
        src = np.array(src, dtype=np.float64)
        tgt = scale * (rotation @ src) + translation
        points.append({
            'id': f'p{i}',
            'kind': (kinds[i] if kinds else 'control'),
            'source': src.tolist(),
            'target': tgt.tolist(),
        })
    return {'targetSpace': target_space, 'verticalDatumVerified': vertical_verified, 'points': points}


SOURCES_5 = [[1.2, 0.0, -4.5], [1.2, 0.0, 2.0], [-6.1, 0.0, 2.0], [-3.0, 1.5, -1.0], [0.0, 1.5, 3.0]]


class RigidFit(unittest.TestCase):
    def test_recovers_known_rigid_transform_exactly(self):
        rotation = rotation_y(math.radians(37))
        translation = np.array([10.0, 0.5, -3.0])
        data = make_points(rotation, 1.0, translation, SOURCES_5)
        result = fit_registration(data)
        self.assertLess(result['registration']['fitRmsMetres'], 1e-9)
        matrix = np.array(result['sourceToWorld']).reshape(4, 4, order='F')
        np.testing.assert_allclose(matrix[:3, :3], rotation, atol=1e-9)
        np.testing.assert_allclose(matrix[:3, 3], translation, atol=1e-9)
        self.assertEqual(result['registration']['scale'], 1.0)  # allow_scale defaults False

    def test_rejects_reflection_even_if_it_fits_better(self):
        # A mirrored point set: a naive Kabsch without the determinant correction
        # would happily fit a reflection. fit_registration must still return a
        # proper rotation (det=+1), even at the cost of a worse (but valid) fit.
        rotation = np.diag([1.0, 1.0, -1.0])  # a reflection, not a rotation
        translation = np.array([0.0, 0.0, 0.0])
        data = make_points(rotation, 1.0, translation, SOURCES_5)
        result = fit_registration(data)
        matrix = np.array(result['sourceToWorld']).reshape(4, 4, order='F')
        self.assertGreater(np.linalg.det(matrix[:3, :3]), 0)


class ScaleFit(unittest.TestCase):
    def test_allow_scale_recovers_known_scale(self):
        rotation = rotation_y(math.radians(-12))
        translation = np.array([2.0, 0.0, 5.0])
        data = make_points(rotation, 0.5, translation, SOURCES_5)  # e.g. a scan exported in the wrong units
        result = fit_registration(data, allow_scale=True)
        self.assertAlmostEqual(result['registration']['scale'], 0.5, places=6)
        self.assertLess(result['registration']['fitRmsMetres'], 1e-8)

    def test_scale_disabled_by_default_biases_the_fit(self):
        rotation = rotation_y(0.0)
        translation = np.array([0.0, 0.0, 0.0])
        data = make_points(rotation, 2.0, translation, SOURCES_5)
        result = fit_registration(data, allow_scale=False)
        self.assertEqual(result['registration']['scale'], 1.0)
        self.assertGreater(result['registration']['fitRmsMetres'], 0.5)  # a real scale error, not absorbed


class TargetSpace(unittest.TestCase):
    def test_lambert_target_space_matches_manifest_js_convention(self):
        # target given in EPSG:2154 (E, N, H); must convert like web/nav's
        # x=E-E0, y=H-H0, z=N0-N before fitting (see manifest.js's lambertToWorld).
        rotation = np.eye(3)
        translation_local = np.array([0.0, 0.0, 0.0])
        # A single source point placed exactly at the origin, whose "Lambert" target
        # is offset by a known (dE, dN, dH) — resulting local coordinates should be
        # (dE, dH, -dN) after conversion, then fit with zero residual.
        offsets = [(5.0, -3.0, 1.2), (-2.0, 4.0, 0.4), (1.0, 1.0, -0.6)]
        points = []
        for i, (de, dn, dh) in enumerate(offsets):
            points.append({
                'id': f'g{i}', 'kind': 'control',
                'source': [de, dh, -dn],  # already the expected local-frame point
                'target': [ORIGIN[0] + de, ORIGIN[1] + dn, ORIGIN[2] + dh],
            })
        data = {'targetSpace': 'EPSG:2154-ENH', 'verticalDatumVerified': True, 'points': points}
        result = fit_registration(data)
        self.assertLess(result['registration']['fitRmsMetres'], 1e-9)
        matrix = np.array(result['sourceToWorld']).reshape(4, 4, order='F')
        np.testing.assert_allclose(matrix[:3, :3], np.eye(3), atol=1e-9)
        np.testing.assert_allclose(matrix[:3, 3], [0, 0, 0], atol=1e-9)


class CheckedStatus(unittest.TestCase):
    def test_status_checked_only_with_enough_margin_and_independent_checks(self):
        rotation = rotation_y(math.radians(8))
        translation = np.array([1.0, 0.0, 2.0])
        data = make_points(rotation, 1.0, translation, SOURCES_5, kinds=['control'] * 3 + ['check'] * 2)
        result = fit_registration(data)
        self.assertEqual(result['registration']['status'], 'checked')
        self.assertEqual(result['registration']['controlCount'], 3)
        self.assertEqual(result['registration']['checkCount'], 2)

    def test_status_unverified_without_vertical_datum_confirmation(self):
        rotation = rotation_y(0.1)
        translation = np.array([0.0, 0.0, 0.0])
        data = make_points(rotation, 1.0, translation, SOURCES_5, kinds=['control'] * 3 + ['check'] * 2, vertical_verified=False)
        result = fit_registration(data)
        self.assertEqual(result['registration']['status'], 'unverified')

    def test_status_unverified_with_fewer_than_two_check_points(self):
        rotation = rotation_y(0.1)
        translation = np.array([0.0, 0.0, 0.0])
        data = make_points(rotation, 1.0, translation, SOURCES_5, kinds=['control'] * 4 + ['check'] * 1)
        result = fit_registration(data)
        self.assertEqual(result['registration']['status'], 'unverified')

    def test_noisy_check_point_pushes_status_to_unverified(self):
        rotation = rotation_y(0.05)
        translation = np.array([0.0, 0.0, 0.0])
        data = make_points(rotation, 1.0, translation, SOURCES_5, kinds=['control'] * 3 + ['check'] * 2)
        # Corrupt one check point's target by 30 cm — well over the 10 cm default threshold.
        data['points'][-1]['target'][0] += 0.30
        result = fit_registration(data)
        self.assertEqual(result['registration']['status'], 'unverified')
        self.assertGreater(result['registration']['checkMaxMetres'], 0.10)


class InputValidation(unittest.TestCase):
    def test_rejects_fewer_than_three_points(self):
        data = make_points(np.eye(3), 1.0, np.zeros(3), SOURCES_5[:2])
        with self.assertRaises(ValueError):
            fit_registration(data)

    def test_rejects_missing_target_space(self):
        data = make_points(np.eye(3), 1.0, np.zeros(3), SOURCES_5)
        data['targetSpace'] = 'somewhere'
        with self.assertRaises(ValueError):
            fit_registration(data)

    def test_rejects_duplicate_point_ids(self):
        data = make_points(np.eye(3), 1.0, np.zeros(3), SOURCES_5)
        data['points'][1]['id'] = data['points'][0]['id']
        with self.assertRaises(ValueError):
            fit_registration(data)

    def test_rejects_nearly_collinear_control_points(self):
        collinear = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [2.0, 0.0, 0.0], [3.00001, 0.0, 0.0]]
        data = make_points(np.eye(3), 1.0, np.zeros(3), collinear)
        with self.assertRaises(ValueError):
            fit_registration(data)

    def test_rejects_fewer_than_three_control_points_even_with_extra_checks(self):
        data = make_points(np.eye(3), 1.0, np.zeros(3), SOURCES_5, kinds=['control', 'control', 'check', 'check', 'check'])
        with self.assertRaises(ValueError):
            fit_registration(data)

    def test_rejects_non_positive_thresholds(self):
        data = make_points(np.eye(3), 1.0, np.zeros(3), SOURCES_5)
        with self.assertRaises(ValueError):
            fit_registration(data, max_fit_rms=0)


if __name__ == '__main__':
    unittest.main()
