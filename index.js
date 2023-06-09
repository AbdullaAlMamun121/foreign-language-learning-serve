const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// middleware for jwt token
const jwtVerify = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'Unauthorized access' });
    }
    const token = authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
        if (error) {
            return res.status(401).send({ error: true, message: 'Unauthorized access' });
        }
        req.decoded = decoded;
        next();
    })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uetnypa.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection

        const userCollections = client.db("learningSchool").collection("users");
        const instructorCollections = client.db("learningSchool").collection("instructors");

        // JWT authentication key generated
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send(token);

        });
        // verify admin middleware
        // warning: use verifyJWT before using verifyAdmin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollections.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden' });
            }
            next();
        }
        // verify instructor middleware
        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollections.findOne(query);
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden' });
            }
            next();
        }

        // get all user by api
        app.get('/users', jwtVerify, verifyAdmin, async (req, res) => {
            const result = await userCollections.find().toArray();
            res.send(result);
        });
        // get all class by admin
        app.get('/classes', jwtVerify, verifyAdmin, async (req, res) => {
            const result = await instructorCollections.find().toArray();
            res.send(result)
        })

        app.get('/users/admin/:email', jwtVerify, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.status(403).send({ admin: false, instructor: false });
                return;
            }

            const query = { email: email };
            const user = await userCollections.findOne(query);
            let admin = false;
            let instructor = false;

            if (user) {
                if (user.role === 'admin') {
                    admin = true;
                } else if (user.role === 'instructor') {
                    instructor = true;
                }
            }
            res.send({ admin, instructor });
        });


        app.get('/users/instructor/:email', jwtVerify, verifyInstructor, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ instructor: false });
                return;
            }

            const query = { email: email };
            const user = await userCollections.findOne(query);
            const isInstructor = user?.role === 'instructor';

            const result = { instructor: isInstructor };
            res.send(result);
        });


        // save user into database using email
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const query = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: user,
            }
            const result = await userCollections.updateOne(query, updatedDoc, options);
            res.send(result)
        });

        // make user admin or instructor
        app.patch('/users/:id/role', jwtVerify, async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;
            const filter = { _id: new ObjectId(id) };
            let updatedRole = '';

            if (role === 'admin' || role === 'instructor') {
                const user = await userCollections.findOne(filter);
                if (user.role !== role) {
                    const updatedDoc = {
                        $set: {
                            role: role,
                        },
                    };
                    const result = await userCollections.updateOne(filter, updatedDoc);
                    updatedRole = role;
                }
            }

            res.send({ role: updatedRole });
        });



        // Instructor all functionality here:
        // add class api
        app.post('/instructors', jwtVerify, verifyInstructor, async (req, res) => {
            const addClass = req.body;
            addClass.status = "pending";
            const result = await instructorCollections.insertOne(addClass)
            res.send(result)
        })
        // get all class
        app.get('/instructors', jwtVerify, verifyInstructor, async (req, res) => {
            const result = await instructorCollections.find().toArray();
            res.send(result)
        });

        // make approved or denied for class
        app.patch('/instructors/:id/status', jwtVerify, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;
            const filter = { _id: new ObjectId(id) };
            let updatedStatus = '';

            if (status === 'pending' || status === 'approved' || status === 'denied') {
                const classes = await instructorCollections.findOne(filter);
                if (classes.status !== status) {
                    const updatedDoc = {
                        $set: {
                            status: status,
                        },
                    };
                    const result = await instructorCollections.updateOne(filter, updatedDoc);
                    updatedStatus = status;
                }
            }

            res.send({ status: updatedStatus });
        });

        // update feedback fields 
        app.patch('/instructors/:id', jwtVerify, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { feedBack } = req.body;
            console.log({feedBack})
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    feedback: feedBack,
                }
            }

            const result = await instructorCollections.updateOne(query, updatedDoc);
            res.send(result);
        })



        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send("Language school is running!");
});

app.listen(port, () => {
    console.log("Listening on port", port);
})