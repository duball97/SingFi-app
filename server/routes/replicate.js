import express from 'express';
import { replicate } from '../services/replicate.js';

const router = express.Router();

// Run a Replicate model
router.post('/run', async (req, res) => {
  try {
    const { model, input } = req.body;

    if (!model || !input) {
      return res.status(400).json({ error: 'Model and input are required' });
    }

    const output = await replicate.run(model, { input });

    res.json({ output });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get prediction status
router.get('/predictions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const prediction = await replicate.predictions.get(id);
    res.json(prediction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a prediction
router.post('/predictions', async (req, res) => {
  try {
    const { version, input } = req.body;

    if (!version || !input) {
      return res.status(400).json({ error: 'Version and input are required' });
    }

    const prediction = await replicate.predictions.create({
      version,
      input,
    });

    res.json(prediction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

