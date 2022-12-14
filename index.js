const express = require('express');
const cors = require('cors');
// const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());





app.get('/', async (req, res) => {
  res.send('dental care server is running');
});

app.listen(port, () => console.log(`Dental care running on ${port}`));
