import handler from './index.js';
export default function retry(req, res) { req.url = '/api/retry'; return handler(req, res); }
