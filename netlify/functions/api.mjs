import { handle } from '../../backend/api.mjs';
export default handle;
export const config = {
  path:['/api/*','/cars/:slug','/cars/:slug/','/notices','/notices/','/notices/:slug','/notices/:slug/'],
  rateLimit:{action:'rate_limit',aggregateBy:['ip'],windowSize:60,windowLimit:300}
};
