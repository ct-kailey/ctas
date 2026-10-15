'use strict';
const { createTaskDrafts } = require('./task-drafts');
function mountTaskDraftRoutes(router, { pool, write }) {
  const service = createTaskDrafts({ pool });
  router.get('/task-drafts', async (req, res) => res.json(await service.list(req.params.p, req.user.id, req.query)));
  router.get('/task-drafts/:id', async (req, res) => res.json({ item: await service.get(req.params.p, req.user.id, req.params.id) }));
  router.post('/task-drafts', write, async (req, res) => res.status(201).json(await service.create(req.params.p, req.user.id, req.body)));
  return service;
}
module.exports = { mountTaskDraftRoutes };
