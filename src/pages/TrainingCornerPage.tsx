import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, PlayCircle, CheckCircle2, Clock, Loader2, BookOpen } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";

type Course = { id:string; slug:string; title:string; title_bn:string|null; description:string|null; description_bn:string|null; category:string; difficulty:string; duration_minutes:number; };
type Lesson = { id:string; course_id:string; slug:string; title:string; title_bn:string|null; content:string|null; content_bn:string|null; duration_minutes:number; sort_order:number; };
type ProgressRow = { lesson_id:string; status:string; progress_percent:number; };
const TrainingCornerPage = () => {
 const { user, loading:authLoading } = useAuth(); const {lang}=useI18n(); const bn=lang==="bn"; const navigate=useNavigate();
 const [courses,setCourses]=useState<Course[]>([]); const [lessons,setLessons]=useState<Lesson[]>([]); const [progressRows,setProgressRows]=useState<ProgressRow[]>([]);
 const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [active,setActive]=useState<Lesson|null>(null);
 useEffect(()=>{if(!authLoading&&!user) navigate("/auth");},[user,authLoading,navigate]);
 useEffect(()=>{if(!user)return; let live=true;(async()=>{
  const [c,l,p]=await Promise.all([
   supabase.from("training_courses").select("id,slug,title,title_bn,description,description_bn,category,difficulty,duration_minutes").eq("is_published",true).order("sort_order"),
   supabase.from("training_lessons").select("id,course_id,slug,title,title_bn,content,content_bn,duration_minutes,sort_order").eq("is_published",true).order("sort_order"),
   supabase.from("training_progress").select("lesson_id,status,progress_percent").eq("user_id",user.id)
  ]);
  if(!live)return; if(c.error||l.error||p.error)setError(c.error?.message||l.error?.message||p.error?.message||"");
  setCourses((c.data as Course[])||[]);setLessons((l.data as Lesson[])||[]);setProgressRows((p.data as ProgressRow[])||[]);setLoading(false);
 })();return()=>{live=false;};},[user]);
 const done=new Set(progressRows.filter(p=>p.status==="completed").map(p=>p.lesson_id));
 const percent=useMemo(()=>lessons.length?Math.round(done.size/lessons.length*100):0,[lessons.length,progressRows]);
 const saveProgress=async(lesson:Lesson,completed:boolean)=>{
  if(!user)return; const payload={user_id:user.id,lesson_id:lesson.id,status:completed?"completed":"in_progress",progress_percent:completed?100:50,completed_at:completed?new Date().toISOString():null};
  const {error:saveError}=await supabase.from("training_progress").upsert(payload,{onConflict:"user_id,lesson_id"});
  if(saveError){setError(saveError.message);return;}
  setProgressRows(prev=>[...prev.filter(p=>p.lesson_id!==lesson.id),{lesson_id:lesson.id,status:payload.status,progress_percent:payload.progress_percent}]);
 };
 return <SidebarProvider><SEO title={bn?"ট্রেনিং কর্নার":"Training Corner"} description="Learn practical civil engineering skills through short courses and lessons."/><div className="min-h-screen flex w-full bg-background"><DashboardSidebar/><main className="flex-1 min-w-0"><header className="h-16 border-b flex items-center justify-between px-4 md:px-6 gap-3"><div className="flex items-center gap-3"><SidebarTrigger/><div><p className="text-xs text-muted-foreground">CivilOS AI</p><h1 className="font-semibold">{bn?"ট্রেনিং কর্নার":"Training Corner"}</h1></div></div><div className="flex items-center gap-2"><NotificationBell/><ThemeToggle/></div></header>
 <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6"><section className="rounded-2xl border bg-primary/5 p-6 md:p-8 flex gap-4 items-start"><div className="p-3 rounded-xl bg-primary/10"><GraduationCap className="h-7 w-7 text-primary"/></div><div className="flex-1"><h2 className="text-2xl md:text-3xl font-bold">{bn?"সিভিল ইঞ্জিনিয়ারিং ট্রেনিং কর্নার":"Civil Engineering Training Corner"}</h2><p className="text-muted-foreground mt-2">{bn?"ছোট ছোট লেসনের মাধ্যমে এস্টিমেশন, সাইট কোয়ালিটি ও রডের কাজ শিখুন।":"Build practical skills with short courses on estimation, site quality and reinforcement."}</p><div className="mt-4 max-w-sm"><div className="flex justify-between text-sm mb-2"><span>{bn?"আপনার অগ্রগতি":"Your progress"}</span><span>{percent}%</span></div><Progress value={percent}/></div></div></section>
 {loading?<div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>{bn?"লোড হচ্ছে...":"Loading courses..."}</div>:error?<Card><CardContent className="p-6 text-sm text-destructive">{bn?"ডেটা লোড/সেভ করা যায়নি। লগইন ও ডেটাবেস পারমিশন পরীক্ষা করুন।":"Could not load/save training data. Check sign-in and database permissions."}</CardContent></Card>:courses.length===0?<Card><CardContent className="p-8 text-center">{bn?"এখনো কোনো কোর্স নেই।":"No courses published yet."}</CardContent></Card>:
 <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">{courses.map(course=>{const courseLessons=lessons.filter(l=>l.course_id===course.id);const courseDone=courseLessons.filter(l=>done.has(l.id)).length;return <Card key={course.id} className="flex flex-col"><CardHeader><div className="flex justify-between gap-2"><span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-1">{course.category}</span><span className="text-xs text-muted-foreground">{course.difficulty}</span></div><CardTitle>{bn&&course.title_bn?course.title_bn:course.title}</CardTitle><CardDescription>{bn&&course.description_bn?course.description_bn:course.description}</CardDescription></CardHeader><CardContent className="flex-1 space-y-3"><div className="flex items-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock className="h-3 w-3"/>{course.duration_minutes} min</span><span className="flex items-center gap-1"><BookOpen className="h-3 w-3"/>{courseLessons.length} {bn?"টি লেসন":"lessons"}</span><span>{courseDone}/{courseLessons.length} {bn?"সম্পন্ন":"done"}</span></div>{courseLessons.map(lesson=><div key={lesson.id} className="border rounded-lg p-3 flex items-center gap-3"><div className="shrink-0">{done.has(lesson.id)?<CheckCircle2 className="h-5 w-5 text-green-600"/>:<PlayCircle className="h-5 w-5 text-primary"/>}</div><div className="min-w-0 flex-1"><p className="font-medium text-sm">{bn&&lesson.title_bn?lesson.title_bn:lesson.title}</p><p className="text-xs text-muted-foreground">{lesson.duration_minutes} min</p></div><Button size="sm" variant="outline" onClick={()=>setActive(lesson)}>{bn?"খুলুন":"Open"}</Button></div>)}</CardContent></Card>})}</div>}
 {active&&<div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" onClick={()=>setActive(null)}><Card className="w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>{bn&&active.title_bn?active.title_bn:active.title}</CardTitle><CardDescription>{active.duration_minutes} min</CardDescription></div><Button variant="outline" onClick={()=>setActive(null)}>{bn?"বন্ধ করুন":"Close"}</Button></div></CardHeader><CardContent><div className="whitespace-pre-wrap leading-7 mb-6">{bn&&active.content_bn?active.content_bn:active.content||""}</div><Button onClick={async()=>{await saveProgress(active,true);setActive(null)}}><CheckCircle2 className="h-4 w-4 mr-2"/>{bn?"লেসন সম্পন্ন হিসেবে চিহ্নিত করুন":"Mark lesson complete"}</Button></CardContent></Card></div>}
 </div></main></div></SidebarProvider>;
};
export default TrainingCornerPage;
