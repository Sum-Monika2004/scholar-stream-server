const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const admin = require("firebase-admin");
// const serviceAccount = require("./serviceAccountKey.json");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const decoded = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64",
).toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ogeopwy.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//verify user

const verifyToken = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({
      message: "unauthorized access. Token not found!",
    });
  }
  const token = authorization.split(" ")[1];

  try {
    await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    res.status(401).send({
      message: "Unauthorized access",
    });
  }
};

async function run() {
  try {
    await client.connect();

    const db = client.db("scholar_stream");
    const scholarshipsCollection = db.collection("scholarships");
    const reviewsCollection = db.collection("reviews");
    const applicationsCollection = db.collection("applications");

    // scholarships api

    app.get("/all-scholarships", async (req, res) => {
      const result = await scholarshipsCollection.find().toArray();
      res.send(result);
    });

    // single scholarship

    app.get("/all-scholarships/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid ID" });
      }
      const result = await scholarshipsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.send({
        success: true,
        result,
      });
    });

    //recommended sch

    app.get("/recommended-sch", async (req, res) => {
      const result = await scholarshipsCollection
        .find()
        .sort({
          tuitionFees: "asc",
        })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // add scholarship

    app.post("/all-scholarships", verifyToken, async (req, res) => {
      const scholarship = req.body;

      // scholarship.scholarshipPostDate = new Date();

      const result = await scholarshipsCollection.insertOne(scholarship);

      res.send({
        success: true,
        message: "Scholarship added successfully",
        insertedId: result.insertedId,
      });
    });

    // scholarship search

    app.get("/search", async (req, res) => {
      const search = req.query.search || "";
      const query = {
        $or: [
          { scholarshipName: { $regex: search, $options: "i" } },
          { universityName: { $regex: search, $options: "i" } },
          { subjectCategory: { $regex: search, $options: "i" } },
        ],
      };
      const result = await scholarshipsCollection.find(query).toArray();
      res.send(result);
    });

    // scholarship filter

    app.get("/filter", async (req, res) => {
      const { country, category } = req.query;

      let query = {};
      if (country) {
        query.country = country;
      }
      if (category) {
        query.category = category;
      }
      const result = await scholarshipsCollection.find(query).toArray();
      res.send(result);
    });

    // scholarship sort

    app.get("/sort", async (req, res) => {
      const { order } = req.query;
      const sortOrder = order === "desc" ? -1 : 1;
      const result = await scholarshipsCollection
        .find()
        .sort({ applicationFees: sortOrder })
        .toArray();
      console.log(result);

      res.send(result);
    });

    //delete sch

    app.delete("/all-scholarships/:id", async (req, res) => {
      const { id } = req.params;
      //    const objectId = new ObjectId(id)
      //    const filter = {_id: objectId}
      const result = await scholarshipsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send({
        success: true,
        result,
      });
    });

    // reviews stored

    app.post("/reviews", verifyToken, async (req, res) => {
      const review = req.body;

      review.reviewDate = new Date().toISOString().split("T")[0];
      const result = await reviewsCollection.insertOne(review);
      res.send({
        success: true,
        insertedId: result.insertedId,
        ...review,
      });
    });

    // get reviews

    app.get("/reviews/:scholarshipId", async (req, res) => {
      const { scholarshipId } = req.params;

      const result = await reviewsCollection
        .find({ scholarshipId })
        .sort({ reviewDate: -1 })
        .toArray();

      res.send(result);
    });

    // get all reviews

    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // delete reviews

    app.delete("/reviews/:id", async (req, res) => {
      const { id } = req.params;

      const result = await reviewsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send({ success: true });
    });

    // payment related apis

    app.post("/create-payment-session", verifyToken, async (req, res) => {
      const paymentInfo = req.body;
      const amount =
        (Number(paymentInfo.applicationFees || 0) +
          Number(paymentInfo.tuitionFees || 0) +
          Number(paymentInfo.serviceCharge || 0)) *
        100;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: paymentInfo.userEmail,
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.scholarshipName,
              },
            },

            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,
        metadata: {
          scholarshipId: paymentInfo.scholarshipId,
          scholarshipName: paymentInfo.scholarshipName,
          universityName: paymentInfo.universityName,
        },
        mode: "payment",
        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-failure?session_id={CHECKOUT_SESSION_ID}`,
      });
      console.log(session);
      res.send({ url: session.url });
    });

    // payment success

    app.get("/payment-success/:sessionId", async (req, res) => {
      const { sessionId } = req.params;

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      res.send({
        scholarshipId: session.metadata.scholarshipId,
        email: session.customer_email,
        amount: session.amount_total / 100,
        scholarshipName: session.metadata.scholarshipName,
        universityName: session.metadata.universityName,
      });
    });

    // payment failure

    app.get("/payment-failure/:sessionId", async (req, res) => {
      const { sessionId } = req.params;

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      res.send({
        scholarshipId: session.metadata.scholarshipId,
        email: session.customer_email,
        amount: session.amount_total / 100,
        status: session.payment_status,
        scholarshipName: session.metadata.scholarshipName,
      });
    });

    ////////////////////////////////////////////////////////////////////

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("scholar stream is running");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
