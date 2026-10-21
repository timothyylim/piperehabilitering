import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from test_fetch import reviews

class CacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.place = {'rating': 5, 'userRatingCount': 12, 'reviews': []}

    def test_repeat_uses_cache(self):
        with patch.object(reviews, 'fetch_place', return_value=self.place) as fetch:
            self.assertEqual(reviews.cached_place('key', 'id', self.path), self.place)
            self.assertEqual(reviews.cached_place('key', 'id', self.path), self.place)
            self.assertEqual(fetch.call_count, 1)

    def test_failure_does_not_retry_or_erase_cache(self):
        old = {'place_id': 'id', 'fetched_at': 1, 'place': self.place}
        (self.path / 'place.json').write_text(json.dumps(old))
        with patch.object(reviews, 'fetch_place', side_effect=RuntimeError('403')) as fetch:
            with self.assertRaisesRegex(RuntimeError, '403'):
                reviews.cached_place('key', 'id', self.path)
            with self.assertRaisesRegex(RuntimeError, 'cooldown'):
                reviews.cached_place('key', 'id', self.path)
            self.assertEqual(fetch.call_count, 1)
        self.assertEqual(json.loads((self.path / 'place.json').read_text()), old)

    def test_monthly_limit(self):
        month = reviews.datetime.now(reviews.timezone.utc).strftime('%Y-%m')
        (self.path / 'fetch-state.json').write_text(json.dumps({'month': month, 'attempts': 40}))
        with patch.object(reviews, 'fetch_place') as fetch:
            with self.assertRaisesRegex(RuntimeError, 'Monthly'):
                reviews.cached_place('key', 'id', self.path)
            fetch.assert_not_called()

    def test_expiry_refreshes(self):
        with patch.object(reviews, 'fetch_place', return_value=self.place) as fetch:
            with patch.object(reviews.time, 'time', return_value=1800000000):
                reviews.cached_place('key', 'id', self.path)
            with patch.object(reviews.time, 'time', return_value=1800000000 + 86401):
                reviews.cached_place('key', 'id', self.path)
            self.assertEqual(fetch.call_count, 2)

    def test_corrupt_quota_fails_closed(self):
        (self.path / 'fetch-state.json').write_text('broken')
        with patch.object(reviews, 'fetch_place') as fetch:
            with self.assertRaises(ValueError):
                reviews.cached_place('key', 'id', self.path)
            fetch.assert_not_called()
