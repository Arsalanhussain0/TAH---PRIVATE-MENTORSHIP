"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,getDocs}=require("firebase/firestore");
const projectId="tah-security-emulator";
let env;
async function setup(){
 if(!env) {
  env=await initializeTestEnvironment({
   projectId,
   firestore:{host:"127.0.0.1",port:8080,rules:fs.readFileSync("firestore.rules","utf8")}
  });
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await setDoc(doc(db,"admins/admin1"),{active:true});
   await setDoc(doc(db,"Students/student1"),{name:"Student One",role:"student",active:true,deviceBinding:"bound"});
   await setDoc(doc(db,"Students/student2"),{name:"Student Two",role:"student",active:true});
   await setDoc(doc(db,"Students/firstlogin"),{name:"New Student",role:"student",active:true,mustChangePassword:true});
   await setDoc(doc(db,"Students/suspended"),{name:"Suspended",role:"student",active:false});
   await setDoc(doc(db,"courseCatalog/batch1"),{modules:[]});
   await setDoc(doc(db,"privateVideoMap/batch1"),{videos:{secret:"private"}});
  });
 }
 return env;
}
after(async()=>{if(env)await env.cleanup()});
test("unauthenticated users cannot read student records",async()=>{
 const e=await setup(),db=e.unauthenticatedContext().firestore();
 await assertFails(getDoc(doc(db,"Students/student1")));
});
test("student reads own profile, not other students or admin list",async()=>{
 const e=await setup(),db=e.authenticatedContext("student1").firestore();
 await assertSucceeds(getDoc(doc(db,"Students/student1")));
 await assertFails(getDoc(doc(db,"Students/student2")));
 await assertFails(getDocs(collection(db,"Students")));
});
test("student cannot self-activate, elevate role or change device binding",async()=>{
 const e=await setup(),db=e.authenticatedContext("student1").firestore();
 await assertFails(updateDoc(doc(db,"Students/student1"),{active:false}));
 await assertFails(updateDoc(doc(db,"Students/student1"),{role:"admin"}));
 await assertFails(updateDoc(doc(db,"Students/student1"),{deviceBinding:"new"}));
});
test("admin can list students and rename, but cannot edit device binding or delete",async()=>{
 const e=await setup(),db=e.authenticatedContext("admin1").firestore();
 await assertSucceeds(getDocs(collection(db,"Students")));
 await assertSucceeds(updateDoc(doc(db,"Students/student2"),{name:"Renamed"}));
 await assertFails(updateDoc(doc(db,"Students/student2"),{deviceBinding:"override"}));
 await assertFails(deleteDoc(doc(db,"Students/student2")));
});
test("active student reads course; suspended and first-login users cannot",async()=>{
 const e=await setup();
 await assertSucceeds(getDoc(doc(e.authenticatedContext("student1").firestore(),"courseCatalog/batch1")));
 await assertFails(getDoc(doc(e.authenticatedContext("suspended").firestore(),"courseCatalog/batch1")));
 await assertFails(getDoc(doc(e.authenticatedContext("firstlogin").firestore(),"courseCatalog/batch1")));
});
test("students cannot edit course and nobody can directly read private video mapping",async()=>{
 const e=await setup();
 await assertFails(updateDoc(doc(e.authenticatedContext("student1").firestore(),"courseCatalog/batch1"),{modules:[{}]}));
 await assertFails(getDoc(doc(e.authenticatedContext("student1").firestore(),"privateVideoMap/batch1")));
 await assertFails(getDoc(doc(e.authenticatedContext("admin1").firestore(),"privateVideoMap/batch1")));
});
