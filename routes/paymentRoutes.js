const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

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

// Create Razorpay order
router.post('/create-order', userAuth, async (req, res) => {
  try {
    const { amount } = req.body;
    const options = {
      amount: amount * 100, // paise ಲ್ಲಿ
      currency: 'INR',
      receipt: 'sdk_' + Date.now()
    };
    const order = await razorpay.orders.create(options);
    res.json({ orderId: order.id, amount: order.amount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Verify payment
router.post('/verify', userAuth, async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;

    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpaySignature) {
      await Order.findByIdAndUpdate(orderId, {
        paymentStatus: 'paid',
        razorpayOrderId,
        razorpayPaymentId
      });
      res.json({ message: 'Payment verified!', success: true });
    } else {
      res.status(400).json({ message: 'Payment verification failed!' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;