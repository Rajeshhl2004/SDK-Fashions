
// Shiprocket token get
async function getShiprocketToken() {
  const res = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD
  });
  return res.data.token;
}


// Shiprocket order create
async function createShiprocketOrder(order) {
  try {
    const token = await getShiprocketToken();

    const res = await axios.post(
      'https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',
      {
        order_id: order._id.toString(),
        order_date: new Date().toISOString().split('T')[0],
        pickup_location: 'Primary',
        billing_customer_name: order.address.name,
        billing_phone: order.address.phone,
        billing_address: order.address.street,
        billing_city: order.address.city,
        billing_pincode: order.address.pincode,
        billing_state: order.address.state,
        billing_country: 'India',
        order_items: order.items.map(i => ({
          name: i.name,
          sku: i.product?.toString() || 'SKU001',
          units: i.quantity,
          selling_price: i.price
        })),
        payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
        sub_total: order.totalAmount,
        length: 30,
        breadth: 25,
        height: 5,
        weight: 0.5
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    return res.data;
  } catch (err) {
    console.error('Shiprocket error:', err.message);
    return null;
  }
}
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Product = require('../models/Product');
const axios = require('axios');



// Auth middleware
const userAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Please login!' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token!' });
  }
};

// Place Order
router.post('/place', userAuth, async (req, res) => {
  try {
    const { items, totalAmount, address, paymentMethod, deliveryCharge } = req.body;

    const order = new Order({
      user: req.user.id,
      items,
      totalAmount,
      address,
      paymentMethod,
      deliveryCharge: deliveryCharge || 0,
      orderStatus: 'confirmed'
    });

    await order.save();

    // Shiprocket order create
const shiprocketData = await createShiprocketOrder(order);
if (shiprocketData) {
  order.shiprocketOrderId = shiprocketData.order_id;
  await order.save();
  console.log('Shiprocket order created:', shiprocketData.order_id);
}

    // WhatsApp notify
    await sendWhatsApp(order, address);

    res.status(201).json({ message: 'Order placed!', order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// WhatsApp function
async function sendWhatsApp(order, address) {
  try {
    const items = order.items.map(i =>
      `${i.name} x${i.quantity} = ₹${i.price * i.quantity}`
    ).join('\n');

    const message = `🛍️ *New Order - SDK Fashions*\n\n` +
      `👤 *Customer:* ${address.name}\n` +
      `📞 *Phone:* ${address.phone}\n` +
      `📍 *Address:* ${address.street}, ${address.city}, ${address.state} - ${address.pincode}\n\n` +
      `🛒 *Items:*\n${items}\n\n` +
      `💰 *Total: ₹${order.totalAmount}*\n` +
      `💳 *Payment:* ${order.paymentMethod.toUpperCase()}\n` +
      `📦 *Order ID:* ${order._id}`;

    const phone = process.env.WHATSAPP_NUMBER.replace('+', '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    // WhatsApp Business API (Twilio) use ಮಾಡಿದ್ರೆ ಇಲ್ಲಿ add ಮಾಡು
    // ಇಲ್ಲದಿದ್ರೆ wa.me link ಕೆಲಸ ಮಾಡ್ತದೆ
    console.log('WhatsApp URL:', url);
  } catch (err) {
    console.error('WhatsApp error:', err.message);
  }
}

// Get user orders
router.get('/my-orders', userAuth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cancel order
router.put('/cancel/:id', userAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found!' });
    if (order.user.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized!' });
    if (['delivered', 'shipped'].includes(order.orderStatus)) {
      return res.status(400).json({ message: 'Cannot cancel after shipping!' });
    }
    order.orderStatus = 'cancelled';
    order.cancelledBy = 'user';
    await order.save();
    res.json({ message: 'Order cancelled!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin — get all orders
router.get('/admin/all', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ message: 'Not admin!' });

    const orders = await Order.find().sort({ createdAt: -1 }).populate('user', 'name email');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin — update order status
router.put('/admin/status/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ message: 'Not admin!' });

    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { orderStatus: status },
      { new: true }
    );
    res.json({ message: 'Status updated!', order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Generate Bill
router.get('/bill/:id', async (req, res) => {
  try {
    const token = req.query.token;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const order = await Order.findById(req.params.id).populate('user', 'name email');

    if (!order) return res.status(404).json({ message: 'Order not found!' });

    const items = order.items.map(i => `
      <tr>
        <td>${i.name}</td>
        <td style="text-align:center;">${i.quantity}</td>
        <td style="text-align:right;">₹${i.price}</td>
        <td style="text-align:right;">₹${i.price * i.quantity}</td>
      </tr>
    `).join('');

    const bill = `
<!DOCTYPE html>
<html>
<head>
  <title>Bill - SDK Fashions</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; max-width: 650px; margin: 2rem auto; padding: 1.5rem; color: #333; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2874f0; padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .logo-section h1 { color: #2874f0; font-size: 1.8rem; }
    .logo-section p { color: #666; font-size: 13px; }
    .logo-section .store-info { margin-top: 6px; font-size: 12px; color: #555; }
    .bill-info { text-align: right; font-size: 13px; }
    .bill-info p { margin-bottom: 4px; }
    .bill-info .bill-no { font-size: 15px; font-weight: bold; color: #2874f0; }
    .section-title { font-size: 13px; font-weight: bold; color: #878787; text-transform: uppercase; margin-bottom: 8px; margin-top: 1.2rem; }
    .customer-box { background: #f9f9f9; padding: 1rem; border-radius: 4px; border-left: 3px solid #2874f0; }
    .customer-box p { font-size: 14px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    thead tr { background: #2874f0; color: white; }
    th { padding: 10px 8px; text-align: left; font-size: 13px; }
    td { padding: 10px 8px; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
    tr:nth-child(even) { background: #f9f9f9; }
    .total-table { width: 100%; margin-top: 0; }
    .total-table td { border: none; padding: 6px 8px; font-size: 14px; }
    .total-table .grand-total td { font-weight: bold; font-size: 16px; color: #2874f0; border-top: 2px solid #2874f0; padding-top: 10px; }
    .footer-section { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #f0f0f0; }
    .thank-you { font-size: 13px; color: #666; }
    .thank-you h3 { color: #2874f0; font-size: 15px; margin-bottom: 4px; }
    .qr-section { text-align: center; }
    .qr-section img { width: 80px; height: 80px; }
    .qr-section p { font-size: 11px; color: #666; margin-top: 4px; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 12px; font-weight: bold; }
    .paid { background: #d4edda; color: #155724; }
    .pending-pay { background: #fff3cd; color: #856404; }
    @media print {
      body { margin: 0; padding: 1rem; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="logo-section">
      <h1>SDK Fashions</h1>
      <p>Shivamogga's #1 Fashion Store</p>
      <div class="store-info">
        <p>📍 ನಿನ್ನ address, Shivamogga, Karnataka</p>
        <p>📞 +91 XXXXXXXXXX</p>
        <p>📧 sdkfashions@gmail.com</p>
      </div>
    </div>
    <div class="bill-info">
      <p class="bill-no">INVOICE</p>
      <p>#${order._id.toString().slice(-8).toUpperCase()}</p>
      <p style="margin-top:6px;">Date: ${new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      <span class="status-badge ${order.paymentStatus === 'paid' ? 'paid' : 'pending-pay'}">
        ${order.paymentStatus.toUpperCase()}
      </span>
    </div>
  </div>

  <!-- Customer Details -->
  <p class="section-title">Bill To</p>
  <div class="customer-box">
    <p><strong>${order.address.name}</strong></p>
    <p>📞 ${order.address.phone}</p>
    <p>📍 ${order.address.street}, ${order.address.city}, ${order.address.state} - ${order.address.pincode}</p>
  </div>

  <!-- Items Table -->
  <p class="section-title">Order Items</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Product</th>
        <th>Qty</th>
        <th>Price</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${order.items.map((i, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${i.name}</td>
          <td style="text-align:center;">${i.quantity}</td>
          <td>₹${i.price}</td>
          <td>₹${i.price * i.quantity}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- Total -->
  <table class="total-table">
    <tr><td style="color:#666;">Subtotal</td><td style="text-align:right;">₹${order.totalAmount}</td></tr>
    <tr><td style="color:#666;">Delivery Charge</td><td style="text-align:right; color:green;">FREE</td></tr>
    <tr><td style="color:#666;">Payment Method</td><td style="text-align:right;">${order.paymentMethod.toUpperCase()}</td></tr>
    <tr class="grand-total"><td>Grand Total</td><td style="text-align:right;">₹${order.totalAmount}</td></tr>
  </table>

  <!-- Footer -->
  <div class="footer-section">
    <div class="thank-you">
      <h3>Thank you for shopping! 🛍️</h3>
      <p>For support: +91 XXXXXXXXXX</p>
      <p>sdkfashions@gmail.com</p>
      <p style="margin-top:8px;font-size:11px;color:#999;">This is a computer generated invoice.</p>
    </div>
    <div class="qr-section">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=https://wa.me/91XXXXXXXXXX" />
      <p>Scan for WhatsApp</p>
    </div>
  </div>

  <!-- Print Button -->
  <div style="text-align:center;margin-top:1.5rem;" class="no-print">
    <button onclick="window.print()" style="padding:12px 32px;background:#2874f0;color:white;border:none;border-radius:4px;cursor:pointer;font-size:15px;margin-right:8px;">🖨️ Print / Save PDF</button>
    <button onclick="window.close()" style="padding:12px 32px;background:#f0f0f0;color:#333;border:none;border-radius:4px;cursor:pointer;font-size:15px;">Close</button>
  </div>

</body>
</html>
`;
    res.send(bill);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin — Send to Shiprocket manually
router.post('/admin/shiprocket/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ message: 'Not admin!' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found!' });

    const shiprocketData = await createShiprocketOrder(order);

    if (shiprocketData) {
      order.shiprocketOrderId = shiprocketData.order_id;
      order.orderStatus = 'shipped';
      await order.save();
      res.json({
        message: 'Order sent to Shiprocket!',
        tracking: shiprocketData.shipment_id
      });
    } else {
      res.status(500).json({ message: 'Shiprocket failed!' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



module.exports = router;

