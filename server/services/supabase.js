import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;

export const supabase = new Proxy({}, {
  get(target, prop) {
    if (!supabaseClient) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
      }

      supabaseClient = createClient(supabaseUrl, supabaseKey);
    }
    return supabaseClient[prop];
  }
});

