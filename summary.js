import handler from './index.js';
export default function summary(req, res) { req.url = '/api/summary'; return handler(req, res); }
