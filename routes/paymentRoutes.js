const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Order = require('../models/Order');

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
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(400).json({ message: 'Online payment not available yet! Please use COD.' });
    }

    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const { amount } = req.body;
    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: 'sdk_' + Date.now()
    };
    const order = await razorpay.orders.create(options);
    res.json({ orderId: order.id, amount: order.amount, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Verify payment
router.post('/verify', userAuth, async (req, res) => {
  try {
    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(400).json({ message: 'Payment not configured!' });
    }

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