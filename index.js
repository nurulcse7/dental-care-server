const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.70yiu6o.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1,});

async function run() {
  try {
    const appointmentOptionCollection = client.db('dentalCare').collection('appointmentOptions');
    const bookingsCollection = client.db('dentalCare').collection('bookings');

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
  } finally {
  }
}
run().catch(console.log);

app.get('/', async (req, res) => {
  res.send('dental care server is running');
});

app.listen(port, () => console.log(`Dental care running on ${port}`));
