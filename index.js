const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

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

    // scholarships api
    app.get("/all-scholarships", async (req, res) => {
      const result = await scholarshipsCollection.find().toArray();
      console.log(result);

      res.send(result);
    });

    app.get("/all-scholarships/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      // console.log(id);

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
      console.log(result);

      res.send(result);
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

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
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
