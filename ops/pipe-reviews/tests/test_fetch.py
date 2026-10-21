import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('reviews', Path(__file__).parents[1] / 'update_reviews.py')
reviews = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reviews)

class FetchTests(unittest.TestCase):
    def test_permission_failure_explained_and_key_redacted(self):
        body = json.dumps({'error': {'message': 'Denied test-secret', 'details': [{'reason': 'API_KEY_SERVICE_BLOCKED'}]}}).encode()
        error = HTTPError('https://places.googleapis.com', 403, 'Forbidden', {}, io.BytesIO(body))
        with patch.object(reviews.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaises(RuntimeError) as raised:
                reviews.fetch_place('test-secret', 'place')
        self.assertIn('API_KEY_SERVICE_BLOCKED', str(raised.exception))
        self.assertNotIn('test-secret', str(raised.exception))

    def test_success_parses_reviews(self):
        data = {'rating': 5, 'userRatingCount': 10, 'reviews': []}
        with patch.object(reviews.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(data).encode())):
            self.assertEqual(reviews.fetch_place('test-secret', 'place'), data)

    def test_non_json_error(self):
        error = HTTPError('https://places.googleapis.com', 503, 'Unavailable', {}, io.BytesIO(b'bad gateway'))
        with patch.object(reviews.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaisesRegex(RuntimeError, '503: Unavailable'):
                reviews.fetch_place('test-secret', 'place')

if __name__ == '__main__':
    unittest.main()
