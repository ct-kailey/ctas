'use strict';
const { createTaskAreas } = require('./task-areas');
function mountTaskAreaRoutes(router, { pool, write }) {
  const service = createTaskAreas({ pool });
  router.get('/task-automation/areas', async (req, res) => res.json(await service.list(req.params.p, req.user.id)));
  router.get('/task-automation/tasks/:id/areas', async (req, res) => res.json(await service.get(req.params.p, req.user.id, req.params.id)));
  router.patch('/task-automation/tasks/:id/areas/:area', write, async (req, res) => res.json(await service.update(req.params.p, req.user.id, req.params.id, req.params.area, req.body)));
  return service;
}
module.exports = { mountTaskAreaRoutes };
