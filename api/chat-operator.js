const crypto=require('crypto');
const operator=require('../lib/chat-operator-auth');
const fail=(res,status,message)=>res.status(status).json({ok:false,message});
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return fail(res,405,'POST만 지원합니다.');
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const action=String(body.action||'');
  try{
    if(action==='login'){
      const pwd=String(body.password||'');
      if(pwd.length>256)return fail(res,400,'비밀번호를 확인해 주세요.');
      const row=await operator.account();
      if(!row?.is_active)return fail(res,401,'운영진 계정이 아직 설정되지 않았습니다.');
      if(row.locked_until && Date.parse(row.locked_until)>Date.now())return fail(res,429,'로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.');
      const candidate=operator.hashPassword(pwd,row.password_salt);
      if(!operator.safeEquals(candidate,row.password_hash)){
        const fails=Number(row.failed_attempts||0)+1;
        await operator.db(operator.operatorTable+'?id=eq.primary',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({failed_attempts:fails,locked_until:fails>=5?new Date(Date.now()+15*60*1000).toISOString():null})});
        return fail(res,401,'운영진 비밀번호가 올바르지 않습니다.');
      }
      await operator.db(operator.operatorTable+'?id=eq.primary',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({failed_attempts:0,locked_until:null})});
      return res.status(200).json({ok:true,accessToken:operator.issueOperatorToken(row),role:'operator'});
    }
    if(action==='verify'){
      const valid=await operator.verifyOperatorToken(req);
      return valid?res.status(200).json({ok:true,role:'operator'}):fail(res,401,'운영진 로그인이 만료되었습니다.');
    }
    if(!operator.verifyOwner(req))return fail(res,403,'최고관리자만 운영진 계정을 설정할 수 있습니다.');
    if(action==='status'){
      const row=await operator.account();
      return res.status(200).json({ok:true,configured:!!row?.is_active,role:'owner'});
    }
    if(action==='save'){
      const password=String(body.password||'');
      if(password.length<12||password.length>128)return fail(res,400,'운영진 비밀번호는 12~128자로 설정해 주세요.');
      const salt=crypto.randomBytes(16).toString('hex');
      await operator.db(operator.operatorTable+'?on_conflict=id',{
        method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify({id:'primary',password_salt:salt,password_hash:operator.hashPassword(password,salt),is_active:true,failed_attempts:0,locked_until:null,updated_at:new Date().toISOString()})
      });
      return res.status(200).json({ok:true,message:'운영진 1명 계정이 설정됐습니다. 기존 운영진 로그인은 해제됩니다.'});
    }
    if(action==='disable'){
      await operator.db(operator.operatorTable+'?id=eq.primary',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({is_active:false,updated_at:new Date().toISOString()})});
      return res.status(200).json({ok:true,message:'운영진 접근을 중지했습니다.'});
    }
    return fail(res,400,'지원하지 않는 요청입니다.');
  }catch(error){return fail(res,error.statusCode||500,error.message||'운영진 계정 처리에 실패했습니다.');}
};
