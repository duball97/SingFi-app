const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = {
  // Supabase calls
  supabase: {
    query: async (table, operation, options = {}) => {
      const response = await fetch(`${API_BASE_URL}/supabase/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table,
          operation,
          ...options,
        }),
      });
      return response.json();
    },
  },

  // Replicate calls
  replicate: {
    run: async (model, input) => {
      const response = await fetch(`${API_BASE_URL}/replicate/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input }),
      });
      return response.json();
    },
    createPrediction: async (version, input) => {
      const response = await fetch(`${API_BASE_URL}/replicate/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, input }),
      });
      return response.json();
    },
    getPrediction: async (id) => {
      const response = await fetch(`${API_BASE_URL}/replicate/predictions/${id}`);
      return response.json();
    },
  },
};

