'use strict';
const {createPool,migrate}=require('../platform/server/db');
const {provisionUser}=require('../platform/server/auth');
async function main(){
  if(!process.env.NEW_USER_EMAIL||!process.env.NEW_USER_PASSWORD) throw new Error('Set NEW_USER_EMAIL and NEW_USER_PASSWORD in the environment.');
  const pool=createPool();
  try{
    await migrate(pool);
    const user=await provisionUser(pool,{email:process.env.NEW_USER_EMAIL,name:process.env.NEW_USER_NAME||process.env.NEW_USER_EMAIL,password:process.env.NEW_USER_PASSWORD,projectId:process.env.NEW_USER_PROJECT,role:process.env.NEW_USER_ROLE||'member'});
    console.log(JSON.stringify({created:true,userId:user.id}));
  }finally{await pool.end();}
}
main().catch(e=>{console.error(e.code==='USER_EXISTS'?'User already exists.':'User provisioning failed. Check required variables, password length (12+), and project.');process.exitCode=1;});
