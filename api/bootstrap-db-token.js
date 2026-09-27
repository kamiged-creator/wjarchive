module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(410).json({ message: 'Disabled.' });
};
