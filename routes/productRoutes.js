const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Product = require('../models/Product');
const Review = require('../models/Review');

const userAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Please login!' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token!' });
  }
};

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found!' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add Review
router.post('/:id/review', userAuth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found!' });

    const existing = await Review.findOne({
      product: req.params.id,
      user: req.user.id
    });
    if (existing) return res.status(400).json({ message: 'Already reviewed!' });

    const user = await require('../models/User').findById(req.user.id);
    const review = new Review({
      product: req.params.id,
      user: req.user.id,
      userName: user.name,
      rating,
      comment
    });
    await review.save();

    // Update product rating
    const reviews = await Review.find({ product: req.params.id });
    product.ratings = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    product.numReviews = reviews.length;
    await product.save();

    res.status(201).json({ message: 'Review added!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get Reviews
router.get('/:id/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ product: req.params.id }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;