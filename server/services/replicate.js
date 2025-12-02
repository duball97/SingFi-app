import Replicate from 'replicate';

let replicateClient = null;

export const replicate = new Proxy({}, {
  get(target, prop) {
    if (!replicateClient) {
      const replicateToken = process.env.REPLICATE_API_TOKEN;

      if (!replicateToken) {
        throw new Error('Missing REPLICATE_API_TOKEN environment variable');
      }

      replicateClient = new Replicate({
        auth: replicateToken,
      });
    }
    return replicateClient[prop];
  }
});

