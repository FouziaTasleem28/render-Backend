require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const app = express();

// Enhanced CORS configuration with credentials support
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3002', 'http://192.168.1.4:3000', 'http://192.168.1.4:3002'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Updated MongoDB connection with proper TLS options and specific database name
mongoose.connect(process.env.MONGODB_CONNECTION_STRING, {
  ssl: true,
  tls: true,
  tlsAllowInvalidCertificates: false,
  tlsAllowInvalidHostnames: false,
})
.then(() => console.log('Connected to MongoDB Atlas - Database: healthcareDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_CONNECTION_STRING,
    ttl: 14 * 24 * 60 * 60, // 14 days
    autoRemove: 'native'
  }),
  cookie: {
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days in milliseconds
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Medication Schema
const MedicationSchema = new mongoose.Schema({
  name: String,
  time: String,
  dosage: String,
  tillDate: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
});
const Medication = mongoose.model('Medication', MedicationSchema);

// Chat Message Schema
const ChatMessageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: String,
    enum: ['user', 'bot'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});
const ChatMessage = mongoose.model('ChatMessage', ChatMessageSchema);

// Mood Schema
const MoodSchema = new mongoose.Schema({
  mood: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  notes: {
    type: String,
    default: ''
  },
  date: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});
const Mood = mongoose.model('Mood', MoodSchema);

// Get all medications for the logged-in user
app.get('/api/medications', async (req, res) => {
  try {
    // Get userId from session
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userId = req.session.user._id;
    const meds = await Medication.find({ userId });
    res.json(meds);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch medications' });
  }
});

// Add a medication
app.post('/api/medications', async (req, res) => {
  try {
    // Get userId from session
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const { name, time, dosage, tillDate } = req.body;
    const userId = req.session.user._id;
    
    const med = new Medication({ name, time, dosage, tillDate, userId });
    await med.save();
    res.json(med);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add medication' });
  }
});

// Delete a medication by ID
app.delete('/api/medications/:id', async (req, res) => {
  try {
    // Get userId from session
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userId = req.session.user._id;
    
    // Ensure the medication belongs to the logged-in user
    const medication = await Medication.findById(req.params.id);
    if (!medication) {
      return res.status(404).json({ error: 'Medication not found' });
    }
    
    if (medication.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this medication' });
    }
    
    await Medication.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete medication' });
  }
});

// Update a medication by ID
app.put('/api/medications/:id', async (req, res) => {
  try {
    // Get userId from session
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userId = req.session.user._id;
    const { name, time, dosage, tillDate } = req.body;
    
    // Ensure the medication belongs to the logged-in user
    const medication = await Medication.findById(req.params.id);
    if (!medication) {
      return res.status(404).json({ error: 'Medication not found' });
    }
    
    if (medication.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this medication' });
    }
    
    // Update the medication
    const updatedMedication = await Medication.findByIdAndUpdate(
      req.params.id, 
      { name, time, dosage, tillDate },
      { new: true } // Return the updated document
    );
    
    res.json(updatedMedication);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update medication' });
  }
});

// Mood API Endpoints

// Get all mood entries for the logged-in user
app.get('/api/moods', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userId = req.session.user._id;
    const moods = await Mood.find({ userId }).sort({ date: -1, timestamp: -1 });
    res.json(moods);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mood entries' });
  }
});

// Add a mood entry
app.post('/api/moods', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const { mood, notes, date } = req.body;
    const userId = req.session.user._id;
    
    if (!mood || !date) {
      return res.status(400).json({ error: 'Mood and date are required' });
    }
    
    // Check if mood entry for this date already exists
    const existingMood = await Mood.findOne({ userId, date });
    if (existingMood) {
      return res.status(400).json({ error: 'Mood entry for this date already exists. Please update the existing entry.' });
    }
    
    const moodEntry = new Mood({ mood, notes: notes || '', date, userId });
    await moodEntry.save();
    res.json(moodEntry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add mood entry' });
  }
});

// Update a mood entry by ID
app.put('/api/moods/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userId = req.session.user._id;
    const { mood, notes } = req.body;
    
    // Ensure the mood entry belongs to the logged-in user
    const moodEntry = await Mood.findById(req.params.id);
    if (!moodEntry) {
      return res.status(404).json({ error: 'Mood entry not found' });
    }
    
    if (moodEntry.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this mood entry' });
    }
    
    // Update the mood entry
    const updatedMood = await Mood.findByIdAndUpdate(
      req.params.id, 
      { mood, notes },
      { new: true }
    );
    
    res.json(updatedMood);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mood entry' });
  }
});

// Delete a mood entry by ID
app.delete('/api/moods/:id', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userId = req.session.user._id;
    
    // Ensure the mood entry belongs to the logged-in user
    const moodEntry = await Mood.findById(req.params.id);
    if (!moodEntry) {
      return res.status(404).json({ error: 'Mood entry not found' });
    }
    
    if (moodEntry.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this mood entry' });
    }
    
    await Mood.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete mood entry' });
  }
});

// User Schema
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String
});
const User = mongoose.model('User', UserSchema);

// Register endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User already exists' });
    
    const user = new User({ name, email, password });
    await user.save();
    res.json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await User.findOne({ email, password });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Store user in session
    req.session.user = {
      _id: user._id,
      email: user.email,
      name: user.name
    };
    
    res.json({ 
      email: user.email, 
      name: user.name, 
      isAuthenticated: true 
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// Check if user is authenticated
app.get('/api/auth/check', (req, res) => {
  if (req.session.user) {
    res.json({
      isAuthenticated: true,
      user: {
        name: req.session.user.name,
        email: req.session.user.email
      }
    });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Health Chat API Endpoints
// Get chat history for the logged-in user
app.get('/api/chat/messages', async (req, res) => {
  try {
    // For development purposes, allow access even without authentication
    let userId;
    
    if (req.session.user) {
      userId = req.session.user._id;
    } else {
      // Find a user to use for demo purposes
      const demoUser = await User.findOne();
      if (demoUser) {
        userId = demoUser._id;
      } else {
        return res.status(404).json({ error: 'No users found for demo mode' });
      }
    }
    
    const messages = await ChatMessage.find({ userId })
      .sort({ timestamp: 1 })
      .limit(100);
    
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

// Save a new chat message
app.post('/api/chat/messages', async (req, res) => {
  try {
    // For development purposes, allow saving even without authentication
    let userId;
    
    if (req.session.user) {
      userId = req.session.user._id;
    } else {
      // Find a user to use for demo purposes
      const demoUser = await User.findOne();
      if (demoUser) {
        userId = demoUser._id;
      } else {
        return res.status(404).json({ error: 'No users found for demo mode' });
      }
    }
    
    const { message, sender } = req.body;
    
    if (!message || !sender) {
      return res.status(400).json({ error: 'Message and sender are required' });
    }
    
    const chatMessage = new ChatMessage({
      userId,
      message,
      sender
    });
    
    const savedMessage = await chatMessage.save();
    res.json(savedMessage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save chat message' });
  }
});

// Test endpoint to verify server is working
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working properly' });
});

// Database info endpoint - to check MongoDB collections and structure
app.get('/api/db-info', async (req, res) => {
  try {
    // Get database information
    const dbName = mongoose.connection.name;
    
    // Get collections information
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    // Get counts for each collection
    const counts = {};
    for (const name of collectionNames) {
      counts[name] = await mongoose.connection.db.collection(name).countDocuments();
    }
    
    // Get sample data from chatmessages collection if it exists
    let chatMessageSample = [];
    if (collectionNames.includes('chatmessages')) {
      chatMessageSample = await mongoose.connection.db
        .collection('chatmessages')
        .find({})
        .limit(5)
        .toArray();
    }
    
    res.json({
      database: dbName,
      collections: collectionNames,
      documentCounts: counts,
      chatMessageSample
    });
  } catch (err) {
    console.error('Error getting database info:', err);
    res.status(500).json({ error: 'Failed to get database info', details: err.message });
  }
});

// User lookup endpoint - to identify users by ID
app.get('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email
    });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Failed to fetch user', details: err.message });
  }
});

// Get all users endpoint - for debugging
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }); // Exclude password field
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

app.listen(3001, () => console.log('Server running on port 3001'));