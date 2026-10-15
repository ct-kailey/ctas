'use strict';
const {createCustomerConnections}=require('./customer-connections');

// Mounted after the application's authenticated-session, shared-view, and CSRF
// guards. Service methods also enforce customer and project membership.
function mountCustomerConnectionRoutes(app,{pool,provider}){
  const service=createCustomerConnections({pool,provider});
  app.get('/api/customers',async(req,res)=>res.json(await service.listCustomers(req.user.id)));
  app.post('/api/customers',async(req,res)=>res.status(201).json({customer:await service.createCustomer(req.user.id,req.body)}));
  app.patch('/api/customers/:customerId',async(req,res)=>res.json({customer:await service.updateCustomer(req.params.customerId,req.user.id,req.body)}));
  app.get('/api/customers/:customerId/members',async(req,res)=>res.json(await service.members(req.params.customerId,req.user.id)));
  app.post('/api/customers/:customerId/members',async(req,res)=>res.status(201).json({member:await service.addMember(req.params.customerId,req.user.id,req.body)}));
  app.patch('/api/customers/:customerId/members/:userId',async(req,res)=>res.json({member:await service.updateMember(req.params.customerId,req.params.userId,req.user.id,req.body)}));
  app.delete('/api/customers/:customerId/members/:userId',async(req,res)=>res.json(await service.removeMember(req.params.customerId,req.params.userId,req.user.id,req.body)));
  app.get('/api/customers/:customerId/connections',async(req,res)=>res.json(await service.connections(req.params.customerId,req.user.id)));
  app.post('/api/customers/:customerId/connections',async(req,res)=>res.status(201).json({connection:await service.createConnection(req.params.customerId,req.user.id,req.body)}));
  app.patch('/api/customers/:customerId/connections/:connectionId',async(req,res)=>res.json({connection:await service.updateConnection(req.params.customerId,req.params.connectionId,req.user.id,req.body)}));
  return service;
}
function mountProjectCustomerConnectionRoutes(router,{pool,provider,owner}){
  const service=createCustomerConnections({pool,provider});
  router.get('/customer',async(req,res)=>res.json(await service.projectCustomer(req.params.p,req.user.id)));
  router.patch('/customer',owner,async(req,res)=>res.json(await service.assignCustomer(req.params.p,req.user.id,req.body)));
  router.get('/connection-grants',async(req,res)=>res.json(await service.grants(req.params.p,req.user.id)));
  router.get('/connection-grant-options',owner,async(req,res)=>res.json(await service.grantOptions(req.params.p,req.user.id)));
  router.post('/connection-grants',owner,async(req,res)=>res.status(201).json({grant:await service.createGrant(req.params.p,req.user.id,req.body)}));
  router.patch('/connection-grants/:id',owner,async(req,res)=>res.json({grant:await service.updateGrant(req.params.p,req.params.id,req.user.id,req.body)}));
  return service;
}
module.exports={mountCustomerConnectionRoutes,mountProjectCustomerConnectionRoutes};
