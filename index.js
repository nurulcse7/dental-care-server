const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const port = process.env.PORT || 5000;
const app = express();

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.70yiu6o.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1,});

// JWT verification middleware 75-5 
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
      return res.status(401).send('unauthorized access');
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
      if (err) {
          return res.status(403).send({ message: 'forbidden access' })
      }
      req.decoded = decoded;
      next();
  })
}

async function run() {
  try {
    const appointmentOptionCollection = client.db('dentalCare').collection('appointmentOptions');
    const bookingsCollection = client.db('dentalCare').collection('bookings');
    const usersCollection = client.db('dentalCare').collection('users');
    const doctorsCollection = client.db('dentalCare').collection('doctors');

    // N.B: make sure you use verifyAdmin after verifyJWT 
    // That means Firstly verifyJWT, Secondly verifyAdmin. 
    // Admin verification middleware 76-8
    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);

      if (user?.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };

    // get the all appointmentOptions from mongodb(appointmentOptions) 74-2
    app.get('/appointmentOptions', async (req, res) => {
      const date = req.query.date;
      const query = {};
      const options = await appointmentOptionCollection.find(query).toArray();
      // get the bookings of the provided date 74-5 
      const bookingQuery = { appointmentDate: date };
      const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
      // booking slot by slot 74-5, 6.
      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter((book) => book.treatment === option.name);
        const bookedSlots = optionBooked.map((book) => book.slot);
        const remainingSlots = option.slots.filter((slot) => !bookedSlots.includes(slot));
        option.slots = remainingSlots;
      });
      res.send(options);
    });
// get the all appointmentOptions from mongodb (appointmentOptions) version 2 74-7 
    app.get('/v2/appointmentOptions', async (req, res) => {
      const date = req.query.date;
      const options = await appointmentOptionCollection
        .aggregate([
          {
            $lookup: {
              from: 'bookings',
              localField: 'name',
              foreignField: 'treatment',
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ['$appointmentDate', date],
                    },
                  },
                },
              ],
              as: 'booked',
            },
          },
          {
            $project: {
              name: 1,
              slots: 1,
              booked: {
                $map: {
                  input: '$booked',
                  as: 'book',
                  in: '$$book.slot',
                },
              },
            },
          },
          {
            $project: {
              name: 1,
              slots: {
                $setDifference: ['$slots', '$booked'],
              },
            },
          },
        ])
        .toArray();
      res.send(options);
    });

    /***
     * API Naming Convention 74-4 
     * app.get('/bookings') get all booking form database(mongodb)
     * app.get('/bookings/:id') get one (by id) booking form database(mongodb)
     * app.post('/bookings') insert/add a booking from UI to database(mongodb)
     * app.patch('/bookings/:id') update one (by id) booking form database(mongodb)
     * app.delete('/bookings/:id') delete (by id) booking form database(mongodb)
     */
    // insert/add a booking from UI to database(mongodb) 74-4 
    app.post('/bookings', async (req, res) => {
      const booking = req.body;
      console.log(booking);
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment: booking.treatment,
      };
      // if already booked, so can't booking 74-8
      const alreadyBooked = await bookingsCollection.find(query).toArray(); 
      if (alreadyBooked.length) {
        const message = `You already have a booking on ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, message });
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    // 75-2 get email address from bookings  // 75-5 verifyJWT,
    app.get('/bookings', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
          return res.status(403).send({ message: 'forbidden access' });
      }
      const query = { email: email };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
  })

  // Create token 75-4 
  app.get('/jwt', async (req, res) => {
    const email = req.query.email;
    const query = { email: email };
    const user = await usersCollection.findOne(query);
    console.log(user)
    if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '7d' })
        return res.send({ accessToken: token });
    }
    res.status(403).send({ accessToken: '' })
});

// store user (save user in database when user signup) 75-3
app.post('/users', async (req, res) => {
  const user = req.body;
  console.log(user);
  const result = await usersCollection.insertOne(user);
  res.send(result);
});

// user show to ui 75-5
app.get('/users', async (req, res) => {
    const query = {};
    const users = await usersCollection.find(query).toArray();
    res.send(users);
});

// if user not an admin, he can't access dashboard 75-9
app.get('/users/admin/:email', async (req, res) => {
    const email = req.params.email;
    const query = { email }
    const user = await usersCollection.findOne(query);
    res.send({ isAdmin: user?.role === 'admin' });
})

// user update // make admin // admin verifyJWT, 75-8
app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
    // const decodedEmail = req.decoded.email;
    // const query = { email: decodedEmail };
    // const user = await usersCollection.findOne(query);
    // if (user?.role !== 'admin') {
    //     return res.status(403).send({ message: 'forbidden access' })
    // }
    const id = req.params.id;
    const filter = { _id: ObjectId(id) }
    const options = { upsert: true };
    const updatedDoc = {
        $set: {
            role: 'admin'
        }
    }
    const result = await usersCollection.updateOne(filter, updatedDoc, options);
    res.send(result);
})

// =================Add A Doctor start here ========================//
// get specialty data from mongodb(database) 76-2
app.get('/appointmentSpecialty', async (req, res) => {
  const query = {};
  const result = await appointmentOptionCollection.find(query).project({ name: 1 }).toArray();
  res.send(result);
});

// add a doctor to mongodb 76-5   
app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
  const doctor = req.body;
  const result = await doctorsCollection.insertOne(doctor);
  res.send(result);
});
// show doctor to UI from mongo 76-5  
app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
  const query = {};
  const doctors = await doctorsCollection.find(query).toArray();
  res.send(doctors);
});

// delete a doctor from UI and mongo 76-8  
app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const filter = { _id: ObjectId(id) };
  const result = await doctorsCollection.deleteOne(filter);
  res.send(result);
});

// =================Add A Doctor stop here ========================//

  } finally {
  }
}
run().catch(console.log);

app.get('/', async (req, res) => {
  res.send('dental care server is running');
});

app.listen(port, () => console.log(`Dental care running on ${port}`));
