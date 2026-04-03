const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect("mongodb://Rajesh:Rajeshhl%402004@ac-rjyvq7z-shard-00-00.ujyerur.mongodb.net:27017,ac-rjyvq7z-shard-00-01.ujyerur.mongodb.net:27017,ac-rjyvq7z-shard-00-02.ujyerur.mongodb.net:27017/?ssl=true&replicaSet=atlas-835jco-shard-0&authSource=admin&appName=Cluster0");
    console.log('✅ MongoDB Connected!');
  } catch (err) {
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;