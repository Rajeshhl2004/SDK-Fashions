const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const fs = require('fs');
const Admin = require('../models/Admin');
const Product = require('../models/Product');

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Admin auth middleware
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token!' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ message: 'Not admin!' });
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token!' });
  }
};

// Admin Register (one time only)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await Admin.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Admin already exists!' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ name, email, password: hashedPassword });
    await admin.save();
    res.status(201).json({ message: 'Admin created!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(400).json({ message: 'Admin not found!' });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(400).json({ message: 'Wrong password!' });

    const token = jwt.sign(
      { id: admin._id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ message: 'Login successful!', token, admin: { name: admin.name, email: admin.email } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin Forgot Password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(400).json({ message: 'Admin not found!' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    admin.resetPasswordToken = resetToken;
    admin.resetPasswordExpire = Date.now() + 3600000;
    await admin.save();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: admin.email,
      subject: 'SDK Fashions Admin - Password Reset',
      html: `<h2>Admin Password Reset</h2>
      <a href="http://localhost:5000/admin-reset-password.html?token=${resetToken}">Reset Password</a>
      <p>Expires in 1 hour.</p>`
    });

    res.json({ message: 'Reset email sent!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin Reset Password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const admin = await Admin.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() }
    });
    if (!admin) return res.status(400).json({ message: 'Invalid or expired token!' });

    admin.password = await bcrypt.hash(password, 10);
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpire = undefined;
    await admin.save();
    res.json({ message: 'Password reset successful!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add Product

router.post('/product/add', adminAuth, upload.single('image'), async (req, res) => {
  const sizes = JSON.parse(req.body.sizes || '[]');
// product create ಲ್ಲಿ add ಮಾಡು:
const product = new Product({ name, price, description, category, stock, image, imagePublicId, sizes });
  try {
    const { name, price, description, category, stock, imageUrl } = req.body;

    let image = '';
    let imagePublicId = '';
    

    // Image file upload ಮಾಡಿದ್ರೆ Cloudinary ಗೆ ಹೋಗ್ತದೆ
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'sdk-fashions'
      });
      fs.unlinkSync(req.file.path);
      image = result.secure_url;
      imagePublicId = result.public_id;
    }
    // URL ಕೊಟ್ಟಿದ್ರೆ ಅದನ್ನ use ಮಾಡ್ತದೆ
    else if (imageUrl) {
      image = imageUrl;
      imagePublicId = '';
    } else {
      return res.status(400).json({ message: 'Please provide image file or image URL!' });
    }

    const product = new Product({
      name,
      price,
      description: description || '',
      category,
      stock: stock || 10,
      image,
      imagePublicId
    });

    await product.save();
    res.status(201).json({ message: 'Product added!', product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Edit Product
router.put('/product/edit/:id', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const { name, price, description, category, stock, imageUrl } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found!' });

    if (req.file) {
      // Old image delete
      if (product.imagePublicId) {
        await cloudinary.uploader.destroy(product.imagePublicId);
      }
      const result = await cloudinary.uploader.upload(req.file.path, { folder: 'sdk-fashions' });
      fs.unlinkSync(req.file.path);
      product.image = result.secure_url;
      product.imagePublicId = result.public_id;
    } else if (imageUrl) {
      product.image = imageUrl;
      product.imagePublicId = '';
    }
    // Image ಇಲ್ಲದಿದ್ರೆ existing image ಇರಲಿ

    product.name = name || product.name;
    product.price = price || product.price;
    product.description = description || product.description;
    product.category = category || product.category;
    product.stock = stock || product.stock;
    await product.save();
    res.json({ message: 'Product updated!', product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Delete Product
router.delete('/product/delete/:id', adminAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found!' });

    await cloudinary.uploader.destroy(product.imagePublicId);
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get All Products (Admin)
router.get('/products', adminAuth, async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;