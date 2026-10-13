'use strict';
const {createPool,migrate}=require('../platform/server/db');
const pool=createPool();
migrate(pool).then(()=>console.log('Database migrations complete.')).catch(()=>{console.error('Migration failed. Check database connectivity and configuration.');process.exitCode=1;}).finally(()=>pool.end());
