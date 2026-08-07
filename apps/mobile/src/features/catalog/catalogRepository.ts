import { taskCatalogItemSchema, type TaskCatalogItem } from "@shipshape/api";
import { supabase } from "../../lib/supabase";

const demoCatalog: TaskCatalogItem[] = [
  { id:"demo-workout-1",category:"fitness",title:"Workout 1",description:"Complete any workout that fits the challenge rules.",taskType:"duration",defaultTargetValue:45,defaultUnit:"minutes",allowedUnits:["minutes"],defaultProofPolicy:"optional",safetyNote:"Choose an intensity appropriate for your current ability." },
  { id:"demo-workout-2",category:"fitness",title:"Workout 2",description:"Complete a second workout of any type.",taskType:"duration",defaultTargetValue:30,defaultUnit:"minutes",allowedUnits:["minutes"],defaultProofPolicy:"optional",safetyNote:"Choose an intensity appropriate for your current ability." },
  { id:"demo-steps",category:"fitness",title:"Steps",description:"Reach the number of steps set by the creator.",taskType:"count",defaultTargetValue:10000,defaultUnit:"steps",allowedUnits:["steps"],defaultProofPolicy:"optional",safetyNote:null },
  { id:"demo-water",category:"hydration",title:"Daily water target",description:"Reach the challenge-defined water target.",taskType:"quantity",defaultTargetValue:100,defaultUnit:"ounces",allowedUnits:["ounces"],defaultProofPolicy:"none",safetyNote:"Hydration needs vary." },
  { id:"demo-meal",category:"nutrition",title:"Follow your meal plan",description:"Stay within the plan defined by the challenge.",taskType:"boolean",defaultTargetValue:null,defaultUnit:null,allowedUnits:[],defaultProofPolicy:"none",safetyNote:null },
  { id:"demo-sleep",category:"recovery",title:"Sleep target",description:"Meet the challenge-defined sleep duration.",taskType:"duration",defaultTargetValue:8,defaultUnit:"hours",allowedUnits:["hours"],defaultProofPolicy:"optional",safetyNote:null },
  { id:"demo-read",category:"mindset",title:"Read or listen",description:"Read pages or listen to an audiobook.",taskType:"count",defaultTargetValue:10,defaultUnit:"pages",allowedUnits:["pages","minutes"],defaultProofPolicy:"optional",safetyNote:null },
  { id:"demo-journal",category:"mindset",title:"Daily journal",description:"Write a short reflection for the day.",taskType:"boolean",defaultTargetValue:null,defaultUnit:null,allowedUnits:[],defaultProofPolicy:"optional",safetyNote:null },
  { id:"demo-encourage",category:"team",title:"Encourage a teammate",description:"Leave a meaningful cheer or comment.",taskType:"boolean",defaultTargetValue:null,defaultUnit:null,allowedUnits:[],defaultProofPolicy:"none",safetyNote:null },
];

export async function listTaskCatalog(): Promise<TaskCatalogItem[]> {
  if (!supabase) return demoCatalog;
  const { data, error } = await supabase.from("task_catalog").select("id,category,title,description,task_type,default_target_value,default_unit,allowed_units,default_proof_policy,safety_note").eq("is_public", true).order("category").order("title");
  if (error) throw error;
  return taskCatalogItemSchema.array().parse((data ?? []).map((row) => ({ id: row.id, category: row.category, title: row.title, description: row.description, taskType: row.task_type, defaultTargetValue: row.default_target_value === null ? null : Number(row.default_target_value), defaultUnit: row.default_unit, allowedUnits: row.allowed_units, defaultProofPolicy: row.default_proof_policy, safetyNote: row.safety_note })));
}
