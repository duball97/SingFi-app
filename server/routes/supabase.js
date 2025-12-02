import express from 'express';
import { supabase } from '../services/supabase.js';

const router = express.Router();

// Generic Supabase query endpoint
router.post('/query', async (req, res) => {
  try {
    const { table, operation, filters, data, select } = req.body;

    let result;

    switch (operation) {
      case 'select':
        let query = supabase.from(table).select(select || '*');
        if (filters) {
          Object.entries(filters).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }
        result = await query;
        break;

      case 'insert':
        result = await supabase.from(table).insert(data);
        break;

      case 'update':
        let updateQuery = supabase.from(table).update(data);
        if (filters) {
          Object.entries(filters).forEach(([key, value]) => {
            updateQuery = updateQuery.eq(key, value);
          });
        }
        result = await updateQuery;
        break;

      case 'delete':
        let deleteQuery = supabase.from(table);
        if (filters) {
          Object.entries(filters).forEach(([key, value]) => {
            deleteQuery = deleteQuery.eq(key, value);
          });
        }
        result = await deleteQuery.delete();
        break;

      default:
        return res.status(400).json({ error: 'Invalid operation' });
    }

    if (result.error) {
      return res.status(400).json({ error: result.error.message });
    }

    res.json(result.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

