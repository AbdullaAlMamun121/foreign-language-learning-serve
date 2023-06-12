const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
// const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const Stripe = require('stripe');
// NOTE: Without direct api in this page give me an error!!!!!
const stripe = Stripe('sk_test_51NHnPSIkTkPcHPnMMaFpNc6Ki7LEzDoe1aimwa8s7wRRke2iMEGpV486Dr5jVZQ2p87SQxTpZvf96alGS4QIzyPj00JQcXz1oz');
require('dotenv').config();
const port = process.env.PORT || 5000;

const corsOptions = {
    origin: '*',
    credentials: true,
    optionSuccessStatus: 200,
}

// middleware
app.use(cors(corsOptions))
app.use(express.json());
// middleware


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
    },
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection

        const userCollections = client.db("learningSchool").collection("users");
        const instructorCollections = client.db("learningSchool").collection("instructors");
        const classCollections = client.db("learningSchool").collection("selectedClasses");
        const paymentCollections = client.db("learningSchool").collection("payments");

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
        // verify student middleware
        const verifyStudent = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await classCollections.findOne(query);
            if (user?.role !== 'student') {
                return res.status(403).send({ error: true, message: 'forbidden' });
            }
            next();
        }

        // get all user by api

        app.get('/users/default', jwtVerify, async (req, res) => {
            const result = await userCollections.find().toArray();
            res.send(result);
        });
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
                res.status(403).send({ admin: false, instructor: false, student: false });
                return;
            }

            const query = { email: email };
            const user = await userCollections.findOne(query);
            let admin = false;
            let instructor = false;
            let student = false;

            if (user) {
                if (user.role === 'admin') {
                    admin = true;
                } else if (user.role === 'instructor') {
                    instructor = true;
                } else if (user.role === 'student') {
                    student = true;
                }
            }
            res.send({ admin, instructor, student });
        });


        // save user into database using email
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const query = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $setOnInsert: { role: 'student' },
                $set: user,
            }
            const result = await userCollections.updateOne(query, updatedDoc, options);
            res.send(result)
        });



        app.post('/selectedClass', jwtVerify, async (req, res) => {
            const selectClass = req.body;
            const result = await classCollections.insertOne(selectClass);
            res.send(result);
        });

        app.get('/selectedClass', jwtVerify, async (req, res) => {
            const result = await classCollections.find().toArray();
            res.send(result);
        });

        // delete selected class
        app.delete('/selectedClass/:id', jwtVerify, verifyStudent, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await classCollections.deleteOne(query);
            res.send(result);
        })
        // ----------------------

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

        //  show all class collection only instructors 
        app.get('/instructors', jwtVerify, verifyInstructor, async (req, res) => {
            const email = req.decoded.email;
            const query = { email: email };
            const result = await instructorCollections.find(query).toArray();
            res.send(result)
        });


        app.post('/instructors', jwtVerify, verifyInstructor, async (req, res) => {
            const addClassStatus = req.body;
            addClassStatus.status = "pending";
            const result = await instructorCollections.insertOne(addClassStatus)
            res.send(result)
        })

        // get all instructor for showing instructor link 
        app.get('/instructor/list', async (req, res) => {
            const query = { role: 'instructor' };
            const result = await userCollections.find(query).toArray();
            res.send(result);
        });

        // get all classes for showing class link 
        app.get('/instructor/classes', async (req, res) => {
            const query = { status: 'approved' };
            const result = await instructorCollections.find(query).toArray();
            res.send(result);
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
            console.log({ feedBack })
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    feedback: feedBack,
                }
            }

            const result = await instructorCollections.updateOne(query, updatedDoc);
            res.send(result);
        })
        // Add instructor item updates
        app.put('/updateMyClasses/:id', verifyInstructor, async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const body = req.body;
            console.log(body)
            console.log(body)
            const filter = { _id: new ObjectId(id) };
            const updateMyClass = {
                $set: {
                    className: body.className,
                    email: body.email,
                    price: parseFloat(body.price),
                    seats: parseInt(body.seats),
                }
            };
            const result = await instructorCollections.updateOne(filter, updateMyClass);
            res.send(result);
        })
        //create payment intent
        app.post('/create-payment-intent', jwtVerify, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            })

        })
        // payment api
        app.post('/payments', jwtVerify, async (req, res) => {
            const payment = req.body;
            const result = await paymentCollections.insertOne(payment);
            res.send(result);
        })
     
        app.get('/payments', async (req, res) => {
            try {
                const { itemId } = req.query;

                // Retrieve payment data
                const payments = await paymentCollections.find({ itemId }).toArray();

                // Retrieve instructor data for the matching itemId
                const instructors = await instructorCollections.find({ itemId }).toArray();

                // Merge the instructor information into the payment data
                const result = payments.map((payment) => {
                    const matchingInstructors = instructors.filter(
                        (instructor) => instructor.itemId === payment.itemId
                    );
                    const mergedData = matchingInstructors.map((instructor) => ({
                        instructorImage: instructor.instructorImage,
                        image: instructor.image,
                        className: instructor.className,
                        email: instructor.email,
                        ...payment,
                    }));
                    return mergedData;
                }).flat();

                res.send(result);
            } catch (error) {
                console.error('Error fetching payment data:', error);
                res.status(500).send('Internal Server Error');
            }
        });



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