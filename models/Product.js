const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    enum: ['shirt', 'pant', 'saree', 'kurta', 'jacket', 'other'],
    required: true
  },
  image: {
    type: String,
    required: true
  },
  imagePublicId: {
    type: String
  },
  sizes: {
  type: [String],
  default: []
},
  stock: {
    type: Number,
    default: 10
  },
  ratings: {
    type: Number,
    default: 0
  },
  numReviews: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);