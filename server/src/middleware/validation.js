// Lightweight room validator (no external dependency)
const validateRoom = (req, res, next) => {
  const { name, type } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ success: false, message: '"name" is required' });
  }
  if (name.trim().length > 50) {
    return res.status(400).json({ success: false, message: '"name" must be 50 characters or less' });
  }
  if (!type || !['public', 'private', 'travel_partner'].includes(type)) {
    return res.status(400).json({ success: false, message: '"type" must be public, private, or travel_partner' });
  }

  next();
};

export { validateRoom };