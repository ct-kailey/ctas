'use strict';
const { createProjectJourney } = require('./project-journey');
function mountProjectJourneyRoutes(router, { pool, review }) {
  const service = createProjectJourney({ pool });
  router.get('/journey', async (req,res) => res.json(await service.overview(req.params.p,req.user.id)));
  router.get('/journey/events', async (req,res) => res.json(await service.events(req.params.p,req.user.id,req.query)));
  router.get('/journey/events/:type/:id', async (req,res) => res.json(await service.detail(req.params.p,req.user.id,req.params.type,req.params.id)));
  router.get('/journey/sources/:type/:id', async (req,res) => res.json(await service.getSource(req.params.p,req.user.id,req.params.type,req.params.id)));
  router.post('/journey/milestones', review, async (req,res) => {
    const result = await service.recordMilestone(req.params.p,req.user.id,req.body);
    res.status(result.replayed ? 200 : 201).json(result);
  });
  return service;
}
module.exports = { mountProjectJourneyRoutes };
