import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, Loader2, MailCheck, AlertTriangle } from "lucide-react";

export default function AdminAcceptInvitePage(){
  const {user,loading}=useAuth(); const navigate=useNavigate(); const [params]=useSearchParams();
  const token=params.get("token")||""; const [state,setState]=useState<"ready"|"working"|"success"|"error">("ready");
  const [message,setMessage]=useState("Sign in with the email address that received this invitation.");
  const attempted=useRef(false);
  useEffect(()=>{
    if(loading||!user||!token||attempted.current)return;
    attempted.current=true; setState("working");
    void (async()=>{
      const {data,error}=await supabase.functions.invoke("admin-rbac",{body:{action:"accept",token}});
      if(error||data?.error){setState("error");setMessage(data?.error||error?.message||"Invitation could not be accepted.");return;}
      setState("success");setMessage("Your sub-admin invitation has been accepted. The Super Admin must assign your Users workspace permissions before you can access that area.");
      toast.success("Invitation accepted.");
    })();
  },[loading,user,token]);
  const signIn=()=>navigate(`/auth?redirect=${encodeURIComponent(`/admin/accept-invite?token=${token}`)}`);
  return <>
    <SEO title="Accept Admin Invitation" description="Securely accept your CivilOS sub-admin invitation."/>
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-lg"><CardHeader className="text-center"><div className="mx-auto rounded-2xl bg-primary/10 p-3 w-fit"><ShieldCheck className="h-8 w-8 text-primary"/></div><CardTitle>Accept Sub-Admin Invitation</CardTitle><CardDescription>CivilOS AI · Secure administrator access</CardDescription></CardHeader><CardContent className="space-y-4 text-center">
      {!token?<><AlertTriangle className="h-8 w-8 text-destructive mx-auto"/><p className="text-sm">Invitation token is missing.</p></>
      :loading?<><Loader2 className="h-7 w-7 animate-spin mx-auto"/><p className="text-sm text-muted-foreground">Checking your sign-in status…</p></>
      :!user?<><p className="text-sm text-muted-foreground">{message}</p><Button className="w-full" onClick={signIn}>Sign in to continue</Button></>
      :state==="working"?<><Loader2 className="h-7 w-7 animate-spin mx-auto"/><p className="text-sm text-muted-foreground">Verifying invitation…</p></>
      :state==="success"?<><MailCheck className="h-8 w-8 text-primary mx-auto"/><p className="text-sm">{message}</p><Button className="w-full" onClick={()=>navigate("/admin/users")}>Continue</Button></>
      :state==="error"?<><AlertTriangle className="h-8 w-8 text-destructive mx-auto"/><p className="text-sm">{message}</p><Button variant="outline" className="w-full" onClick={()=>navigate("/")}>Return home</Button></>:null}
      {user&&<p className="text-xs text-muted-foreground break-all">Signed in as {user.email||user.id}</p>}
    </CardContent></Card></main>
  </>;
}
