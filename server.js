const express = require('express');
const fetch = require('node-fetch');
const https = require('https')
const axios = require('axios')
const request = require('request')
const bodyParser = require('body-parser');
const multer = require('multer')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs')
const session = require('express-session');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const {Translate} = require('@google-cloud/translate').v2;

const uri = "mongodb+srv://myAtlasDBUser:111@myatlasclusteredu.z25a02h.mongodb.net/?retryWrites=true&w=majority";
const fitnessApiKey = "M6ahcz/Z9gDXZJyKxYr5fQ==ZxSYM7Hw15ARHryJ"
const ExDBKey = "3635|P5hf2qshKHvvgoGz3mfvH1WCaDwqkd7CwncWUqYC"
const app = express();


require('dotenv').config();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

app.use('/public', express.static(path.join(__dirname, 'public')));

app.get("/client.js", function (req, res) {
    res.sendFile(__dirname + '/public/client.js', { headers: { 'Content-Type': 'application/javascript' } });
});

app.use(session({   
    secret: 'my-secret-key', 
    resave: false,
    saveUninitialized: true,
}));
const upload = multer({ dest: 'public/uploads/' });

let client;

async function run() {
    client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        }
    });

    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

run().catch(console.dir);

app.use('/public/style.css', (req, res, next) => {
    res.type('text/css');
    next(); 
});

const authenticateUser = (req, res, next) => {
    if (req.session && req.session.userId) {
      return next();
    } 
    res.redirect('/login');
};

app.get('/', authenticateUser, async (req, res) => {
    try {
        const items = await client.db("users").collection("gallery").find({}).toArray();
        res.render('index', { items: items, image: undefined, exercises: {}});
    } catch (error) {
        console.error('Error fetching gallery items:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get("/login", (req, res) => {
    res.render('login', { error: null }); 
});

app.get("/signup", (req, res) => {
    res.render('signup', { error: null }); 
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
  
    const user = await client.db("users").collection("users").findOne({ username: username });
  
    if (user) {
      const match = await bcrypt.compare(password, user.password);

      if (match) {
        req.session.userId = user._id;
        res.redirect('/'); 
      } else {
        res.render('login', { error: 'Invalid username or password' });
      }
    } else {
      res.render('login', { error: 'Invalid username or password' });
    }
});

app.post('/signup', async (req, res) => {
    const { newUsername, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
        return res.render('signup', { signupError: 'Passwords do not match' });
    }
    const existingUser = await client.db("users").collection("users").findOne({ username: newUsername });
    if (existingUser) {
        return res.render('signup', { signupError: 'Username already exists' });
    }

    try {
        const currentDate = new Date(); 
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        const newUser = await client.db("users").collection("users").insertOne({
            username: newUsername,
            password: hashedPassword, 
            creation_date: currentDate,
            update_date: currentDate,
            admin_status: 'regular' 
        });

        req.session.userId = newUser.insertedId;
        console.log('User successfully signed up. Redirecting...');
        res.redirect('/');
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            res.status(500).send('Internal Server Error');
        } else {
            res.redirect('/login');
        }
    });
});

app.get("/profile", authenticateUser, async (req, res) => {
    try {
        const user = await client.db("users").collection("users").findOne({ _id: new ObjectId(req.session.userId) });
        
        if (user.username === "alisher" && user.admin_status === "admin") {
            const users = await client.db("users").collection("users").find({}).toArray();
            const items = await client.db("users").collection("gallery").find({}).toArray();

            res.render('admin-profile', { users: users, items: items});
        } else {
            res.render('user-profile', { user: user });
        }
    } catch (error) {
        console.error('Error fetching user profile data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/profile/edit', authenticateUser, async (req, res) => {
    try {
        const loggedInUserId = req.session.userId;
        const { userId, newUsername, newPassword } = req.body;
        const currentDate = new Date();

        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        const loggedInUser = await client.db("users").collection("users").findOne({ _id: new ObjectId(loggedInUserId) });

        if (loggedInUser && loggedInUser.admin_status === 'admin') {
            await client.db("users").collection("users").updateOne(
                { _id: new ObjectId(userId) },
                { $set: { username: newUsername, password: hashedNewPassword, update_date: currentDate } }
            );
        } else {
            await client.db("users").collection("users").updateOne(
                { _id: new ObjectId(loggedInUserId) },
                { $set: { username: newUsername, password: hashedNewPassword, update_date: currentDate } }
            );
        }

        res.redirect('/profile');
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/profile/delete', authenticateUser, async (req, res) => {
    try {
        const loggedInUserId = req.session.userId;
        const userIdToDelete = req.body.userId; 
        const loggedInUser = await client.db("users").collection("users").findOne({ _id: new ObjectId(loggedInUserId) });

        if (loggedInUser.admin_status === 'admin') {
            await client.db("users").collection("users").deleteOne({ _id: new ObjectId(userIdToDelete) });
            res.redirect('/profile'); 
        } else {
            await client.db("users").collection("users").deleteOne({ _id: new ObjectId(loggedInUserId) });
            req.session.destroy(); 
            res.redirect('/login');
        }
    } catch (error) {
        console.error('Error deleting user profile:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/fitness', authenticateUser, async (req, res) => {
    const items = await client.db("users").collection("gallery").find({}).toArray();
    const muscleGroup = req.body.muscleGroup;
    const userId = req.session.userId;

    let primaryMuscleGroups = '';
    let secondaryMuscleGroups = '';

    if (muscleGroup === 'abdominals') {
        primaryMuscleGroups = 'core';
        secondaryMuscleGroups = 'core_lower'; 
    } else if (muscleGroup === 'abductors') {
        primaryMuscleGroups = 'abductors';
        secondaryMuscleGroups = 'adductors,gluteus';
    } else if (muscleGroup === 'adductors') {
        primaryMuscleGroups = 'adductors';
        secondaryMuscleGroups = 'abductors,gluteus';
    } else if (muscleGroup === 'biceps') {
        primaryMuscleGroups = 'biceps';
        secondaryMuscleGroups = 'forearms';
    } else if (muscleGroup === 'calves') {
        primaryMuscleGroups = 'calfs';
        secondaryMuscleGroups = 'quadriceps,hamstring';
    } else if (muscleGroup === 'chest') {
        primaryMuscleGroups = 'chest';
        secondaryMuscleGroups = 'triceps,shoulders_front';
    } else if (muscleGroup === 'forearms') {
        primaryMuscleGroups = 'forearms';
        secondaryMuscleGroups = 'biceps';
    } else if (muscleGroup === 'glutes') {
        primaryMuscleGroups = 'gluteus';
        secondaryMuscleGroups = 'abductors,adductors';
    } else if (muscleGroup === 'hamstrings') {
        primaryMuscleGroups = 'hamstring';
        secondaryMuscleGroups = 'quadriceps';
    } else if (muscleGroup === 'lats') {
        primaryMuscleGroups = 'latissimus';
        secondaryMuscleGroups = 'back_upper';
    } else if (muscleGroup === 'lower_back') {
        primaryMuscleGroups = 'back_lower';
        secondaryMuscleGroups = 'gluteus';
    } else if (muscleGroup === 'middle_back') {
        primaryMuscleGroups = 'back_upper';
        secondaryMuscleGroups = 'latissimus';
    } else if (muscleGroup === 'neck') {
        primaryMuscleGroups = 'neck';
        secondaryMuscleGroups = 'shoulders';
    } else if (muscleGroup === 'quadriceps') {
        primaryMuscleGroups = 'quadriceps';
        secondaryMuscleGroups = 'hamstring';
    } else if (muscleGroup === 'triceps') {
        primaryMuscleGroups = 'triceps';
        secondaryMuscleGroups = 'shoulders';
    }  else if(muscleGroup === 'traps'){
        primaryMuscleGroups = 'shoulders_front';
        secondaryMuscleGroups = 'shoulders_back';
    }
    
    try {
        const imageResponse = await axios({
            method: 'GET',
            url: 'https://muscle-group-image-generator.p.rapidapi.com/getMulticolorImage',
            params: {
                primaryColor: '240,60,80',
                secondaryColor: '200,100,80',
                primaryMuscleGroups: primaryMuscleGroups,
                secondaryMuscleGroups: secondaryMuscleGroups,
                transparentBackground: '0'
            },
            headers: {
                'X-RapidAPI-Key': '0c21c2d37cmsh05b98d4f2cec31dp1ca69ajsn62195f196f60',
                'X-RapidAPI-Host': 'muscle-group-image-generator.p.rapidapi.com',
            },
            responseType: 'arraybuffer'
        });

        const image = Buffer.from(imageResponse.data, 'binary').toString('base64');

        const exerciseResponse = await axios.get('https://api.api-ninjas.com/v1/exercises?muscle=' + muscleGroup, {
            headers: {
                'X-Api-Key': fitnessApiKey
            },
        });

        const exercises = exerciseResponse.data;

        const user = await client.db("users").collection("users").findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        let exerciseNames = [];
        exercises.forEach((exercise) => {
            exerciseNames.push(exercise.name);
        });

        const workout = {
            userId: userId,
            muscleGroup: muscleGroup,
            exerciseNames: exerciseNames,
        };

        console.log(exercises)

        //await client.db("users").collection("workouts").insertOne(workout);
        res.render('index', {items: items,  image: `data:${imageResponse.headers['content-type']};base64,${image}`,exercises: exercises});
    } catch (error) {
        console.error(error);
        res.render('index', {items: items,  image: undefined,exercises: exercises});

    }
});

app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(403).json({ error: 'You must be an admin to perform this action.' });
    }

    console.log(req.body.name);

    const newItem = {
        name: req.body.name,
        picture: '/uploads/' + req.file.filename, 
        createdAt: new Date(),
        updatedAt: new Date()
    };

    try {
        await client.db("users").collection("gallery").insertOne(newItem);
        res.redirect("/profile")
    } catch (error) {
        console.error('Error saving new item:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/update-item', upload.single('image'), async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(403).json({ error: 'You must be an admin to perform this action.' });
    }
    console.log(req.body.itemId, req.body.name, req.file);

    try {
        await client.db("users").collection("gallery").updateOne(
            { _id: new ObjectId(req.body.itemId) },
            { $set: { name: req.body.name, picture: '/uploads/' + req.file.filename, updatedAt: new Date() } }
        );
        res.redirect("/profile")
    } catch (error) {
        console.error('Error updating item:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/delete-item', async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(403).json({ error: 'You must be an admin to perform this action.' });
    }
    console.log(req.body.itemId);

    try {
        await client.db("users").collection("gallery").deleteOne({ _id: new ObjectId(req.body.itemId) });
        res.redirect("/profile")
    } catch (error) {
        console.error('Error deleting item:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(3000, function () {
    console.log("Server is running on 3000 port");
});