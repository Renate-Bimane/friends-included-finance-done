import handler from './index.js';
export default function transaction(req, res) { req.url = '/api/transaction'; return handler(req, res); }
