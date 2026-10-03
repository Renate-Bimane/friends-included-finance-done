import handler from './index.js';
export default function decision(req, res) { req.url = '/api/decision'; return handler(req, res); }
