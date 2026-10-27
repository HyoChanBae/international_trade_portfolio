import { useEffect, useMemo, useState } from 'react';
import '../styles/long-investment.css';

type Horizon = 'long' | 'mid' | 'short';
type Currency = 'KRW' | 'USD';
type Holding = { id:string; name:string; ticker:string; market:string; sector:string; currency:Currency; price:number; avg:number; qty:number; maxQty:number; maxDate:string; targetQty:number; years:number; memos:string[] };
type Buyback = { id:string; date:string; qty:number; price:number };
type Sale = { id:string; name:string; ticker:string; date:string; qty:number; price:number; currency:Currency; reason:string; plan:string; large:boolean; buybacks:Buyback[] };
type PageState = { cash:number; principal:number; drawdown:number; goalYears:number; goalShares:number; sector:string; holdings:Holding[]; sells:Sale[] };
type Defense = { defense:number; missed:number; confirmedQty:number; openQty:number; calculable:boolean };

const profiles = {
  long:{title:'장기 투자',subtitle:'시간과 함께 주식을 모아가는 투자 여정을 기록해보세요. 현금 관리, 목표 주식 수, 매도 기록까지 한눈에 확인할 수 있습니다.',period:'장기 투자 연수',unit:'년',key:'quietalpha-long-v1'},
  mid:{title:'중기 투자',subtitle:'실적을 확인하며 주식을 모아가는 중기 여정을 기록해보세요. 현금 관리, 목표 주식 수, 매도 기록까지 한눈에 확인할 수 있습니다.',period:'중기 투자 기간',unit:'개월',key:'quietalpha-mid-v2'},
  short:{title:'단기 투자',subtitle:'진입과 청산을 나누어 보는 단기 여정을 기록해보세요. 현금 관리, 목표 주식 수, 매도 기록까지 한눈에 확인할 수 있습니다.',period:'단기 투자 기간',unit:'주',key:'quietalpha-short-v2'},
};

const holdings:Record<Horizon,Holding[]> = {
  long:[
    {id:'aapl',name:'애플',ticker:'AAPL',market:'미국',sector:'기술',currency:'USD',price:250.3,avg:180.2,qty:50,maxQty:100,maxDate:'2024-05-10',targetQty:200,years:10,memos:['장기 보유','배당 재투자']},
    {id:'tsla',name:'테슬라',ticker:'TSLA',market:'미국',sector:'기술',currency:'USD',price:198.25,avg:220.1,qty:30,maxQty:80,maxDate:'2023-12-01',targetQty:100,years:5,memos:['분할 매수']},
    {id:'sec',name:'삼성전자',ticker:'005930',market:'한국',sector:'반도체',currency:'KRW',price:72300,avg:68500,qty:100,maxQty:150,maxDate:'2024-03-15',targetQty:300,years:10,memos:['국장 핵심','추가 매수 대기']},
    {id:'nvda',name:'엔비디아',ticker:'NVDA',market:'미국',sector:'반도체',currency:'USD',price:134.5,avg:110.2,qty:20,maxQty:60,maxDate:'2024-06-20',targetQty:150,years:10,memos:[]},
  ],
  mid:[
    {id:'hynix',name:'SK하이닉스',ticker:'000660',market:'한국',sector:'반도체',currency:'KRW',price:185000,avg:172000,qty:20,maxQty:40,maxDate:'2025-11-02',targetQty:40,years:12,memos:['실적 확인 후 추가']},
    {id:'hyundai',name:'현대차',ticker:'005380',market:'한국',sector:'자동차',currency:'KRW',price:245000,avg:268000,qty:15,maxQty:30,maxDate:'2025-08-14',targetQty:25,years:9,memos:['실적 발표 대기']},
    {id:'msft',name:'마이크로소프트',ticker:'MSFT',market:'미국',sector:'기술',currency:'USD',price:420,avg:380,qty:8,maxQty:12,maxDate:'2025-06-20',targetQty:15,years:12,memos:['클라우드 실적']},
    {id:'naver',name:'NAVER',ticker:'035420',market:'한국',sector:'인터넷',currency:'KRW',price:198000,avg:175000,qty:10,maxQty:18,maxDate:'2025-09-01',targetQty:20,years:6,memos:[]},
  ],
  short:[
    {id:'sec-s',name:'삼성전자',ticker:'005930',market:'한국',sector:'반도체',currency:'KRW',price:72300,avg:69800,qty:12,maxQty:25,maxDate:'2026-09-02',targetQty:20,years:3,memos:['눌림 대기','분할 청산']},
    {id:'tsla-s',name:'테슬라',ticker:'TSLA',market:'미국',sector:'기술',currency:'USD',price:198.25,avg:214,qty:8,maxQty:15,maxDate:'2026-08-18',targetQty:12,years:2,memos:['이벤트 전 비중']},
    {id:'kakao',name:'카카오',ticker:'035720',market:'한국',sector:'인터넷',currency:'KRW',price:41200,avg:38900,qty:12,maxQty:20,maxDate:'2026-09-10',targetQty:18,years:4,memos:['단기 박스권']},
  ],
};

const sales:Record<Horizon,Sale[]> = {
  long:[
    {id:'s-aapl-2',name:'애플',ticker:'AAPL',date:'2026-09-18',qty:10,price:265.4,currency:'USD',reason:'단기 과열 구간에서 일부 비중 축소',plan:'240달러 아래부터 분할 재매수',large:false,buybacks:[]},
    {id:'s-aapl-1',name:'애플',ticker:'AAPL',date:'2026-08-10',qty:5,price:230.1,currency:'USD',reason:'현금 비중 확보',plan:'실적 확인 후 재진입 검토',large:false,buybacks:[]},
    {id:'s-tsla-1',name:'테슬라',ticker:'TSLA',date:'2026-07-22',qty:20,price:220,currency:'USD',reason:'변동성 확대 전 비중 축소',plan:'190달러 부근에서 다시 모으기',large:false,buybacks:[]},
    {id:'s-sec-1',name:'삼성전자',ticker:'005930',date:'2026-06-12',qty:30,price:80000,currency:'KRW',reason:'목표 비중 초과분 정리',plan:'실적 발표 이후 재매수',large:false,buybacks:[]},
    {id:'s-nvda-1',name:'엔비디아',ticker:'NVDA',date:'2026-05-19',qty:10,price:150,currency:'USD',reason:'밸류에이션 부담',plan:'조정 구간에서 분할 재매수',large:false,buybacks:[{id:'b-nvda-1',date:'2026-09-05',qty:4,price:140}]},
  ],
  mid:[
    {id:'m1',name:'현대차',ticker:'005380',date:'2025-10-12',qty:15,price:278000,currency:'KRW',reason:'실적 확인 전 비중 축소',plan:'실적 발표 이후 목표 수량까지 다시 모은다.',large:true,buybacks:[]},
    {id:'m2',name:'SK하이닉스',ticker:'000660',date:'2025-07-03',qty:10,price:196000,currency:'KRW',reason:'단기 급등 일부 정리',plan:'조정이 오면 12개월 목표까지 재매수한다.',large:false,buybacks:[]},
  ],
  short:[
    {id:'sh1',name:'삼성전자',ticker:'005930',date:'2026-09-15',qty:13,price:76000,currency:'KRW',reason:'단기 목표 달성 후 일부 청산',plan:'다음 눌림에서 목표 수량까지 다시 모은다.',large:true,buybacks:[]},
    {id:'sh2',name:'테슬라',ticker:'TSLA',date:'2026-08-28',qty:7,price:215,currency:'USD',reason:'이벤트 전 비중 축소',plan:'변동성이 줄어들면 다시 진입한다.',large:false,buybacks:[]},
  ],
};

const clone = <T,>(value:T):T => JSON.parse(JSON.stringify(value));
const today = () => new Date().toLocaleDateString('sv-SE');
const seed = (h:Horizon):PageState => ({cash:h==='long'?5000000:h==='mid'?3000000:1500000,principal:h==='long'?20000000:h==='mid'?8000000:4000000,drawdown:h==='long'?47:h==='mid'?20:12,goalYears:h==='long'?10:h==='mid'?12:4,goalShares:h==='long'?500:h==='mid'?120:80,sector:'',holdings:clone(holdings[h]),sells:clone(sales[h])});

function loadState(h:Horizon):PageState {
  const fallback=seed(h);
  try {
    const saved=JSON.parse(localStorage.getItem(profiles[h].key)||'null');
    if(!saved?.holdings||!saved?.sells) return fallback;
    const migratedHoldings:Holding[]=saved.holdings.map((row:Holding)=>({...row,memos:Array.isArray(row.memos)?row.memos:[]}));
    const legacyPrices:Record<string,{price:number;currency:Currency}>={
      'long:s1':{price:220,currency:'USD'},
      'long:s2':{price:80000,currency:'KRW'},
      'long:s3':{price:150,currency:'USD'},
    };
    const migratedSales:Sale[]=saved.sells.map((row:Sale)=>{
      const sample=sales[h].find(item=>item.id===row.id);
      const holding=migratedHoldings.find(item=>item.ticker===row.ticker);
      const legacy=legacyPrices[`${h}:${row.id}`];
      return {...row,price:Number(row.price)||sample?.price||legacy?.price||0,currency:row.currency||sample?.currency||legacy?.currency||holding?.currency||'KRW',buybacks:Array.isArray(row.buybacks)?row.buybacks:(sample?.buybacks||[])};
    });
    return {...fallback,...saved,holdings:migratedHoldings,sells:migratedSales};
  } catch { return fallback; }
}

function metric(sale:Sale,current:number):Defense {
  const confirmedQty=sale.buybacks.reduce((sum,buy)=>sum+buy.qty,0);
  const openQty=Math.max(0,sale.qty-confirmedQty);
  if(!(sale.price>0)||!(current>0)) return {defense:0,missed:0,confirmedQty,openQty,calculable:false};
  const effects=[...sale.buybacks.map(buy=>(sale.price-buy.price)*buy.qty),(sale.price-current)*openQty];
  return {defense:effects.reduce((sum,value)=>sum+Math.max(value,0),0),missed:effects.reduce((sum,value)=>sum+Math.max(-value,0),0),confirmedQty,openQty,calculable:true};
}

function money(value:number,currency:Currency='KRW') {
  const digits=currency==='USD'?2:0;
  return `${value.toLocaleString('ko-KR',{minimumFractionDigits:digits,maximumFractionDigits:digits})}${currency==='USD'?' USD':'원'}`;
}

export function InvestmentHorizonPage({horizon}:{horizon:Horizon}) {
  const profile=profiles[horizon];
  const [state,setState]=useState<PageState>(()=>loadState(horizon));
  const [panel,setPanel]=useState('hold');
  const [addOpen,setAddOpen]=useState(false);
  const [sellTarget,setSellTarget]=useState<Holding|null>(null);
  const [buybackTarget,setBuybackTarget]=useState<Holding|null>(null);
  const [defenseTarget,setDefenseTarget]=useState<Holding|null>(null);
  useEffect(()=>setState(loadState(horizon)),[horizon]);
  useEffect(()=>localStorage.setItem(profile.key,JSON.stringify(state)),[state,profile.key]);

  const fx=1350;
  const market=state.holdings.reduce((sum,row)=>sum+row.price*row.qty*(row.currency==='USD'?fx:1),0);
  const profit=market-state.principal;
  const rate=state.principal?profit/state.principal*100:0;
  const assets=market+state.cash;
  const weight=assets?state.cash/assets*100:0;
  const shares=state.holdings.reduce((sum,row)=>sum+row.qty,0);
  const avoided=state.cash*state.drawdown/100;
  const visible=state.holdings.filter(row=>!state.sector||row.sector===state.sector);
  const byTicker=useMemo(()=>{
    const result:Record<string,Defense>={};
    state.holdings.forEach(holding=>{
      result[holding.ticker]=state.sells.filter(sale=>sale.ticker===holding.ticker).reduce<Defense>((sum,sale)=>{
        const item=metric(sale,holding.price);
        return {defense:sum.defense+item.defense,missed:sum.missed+item.missed,confirmedQty:sum.confirmedQty+item.confirmedQty,openQty:sum.openQty+item.openQty,calculable:sum.calculable||item.calculable};
      },{defense:0,missed:0,confirmedQty:0,openQty:0,calculable:false});
    });
    return result;
  },[state.holdings,state.sells]);
  const actualDefense=state.holdings.reduce((sum,row)=>sum+(byTicker[row.ticker]?.defense||0)*(row.currency==='USD'?fx:1),0);
  const missedGain=state.holdings.reduce((sum,row)=>sum+(byTicker[row.ticker]?.missed||0)*(row.currency==='USD'?fx:1),0);
  const patchHolding=(id:string,field:keyof Holding,value:number)=>setState(current=>({...current,holdings:current.holdings.map(row=>row.id===id?{...row,[field]:value,maxQty:field==='qty'&&value>row.maxQty?value:row.maxQty}:row)}));

  const recordBuyback=(target:Holding,qty:number,price:number,date:string)=>setState(current=>{
    let remaining=qty;
    const allocations=new Map<string,Buyback[]>();
    [...current.sells].filter(sale=>sale.ticker===target.ticker).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).forEach(sale=>{
      if(remaining<=0) return;
      const used=sale.buybacks.reduce((sum,buy)=>sum+buy.qty,0);
      const matched=Math.min(Math.max(sale.qty-used,0),remaining);
      if(matched>0){allocations.set(sale.id,[{id:`b${Date.now()}-${sale.id}`,date,qty:matched,price}]);remaining-=matched;}
    });
    const matchedQty=qty-remaining;
    return {...current,sells:current.sells.map(sale=>({...sale,buybacks:[...sale.buybacks,...(allocations.get(sale.id)||[])]})),holdings:current.holdings.map(row=>row.ticker===target.ticker?{...row,avg:row.qty+matchedQty>0?(row.avg*row.qty+price*matchedQty)/(row.qty+matchedQty):price,qty:row.qty+matchedQty,maxQty:Math.max(row.maxQty,row.qty+matchedQty)}:row)};
  });

  return <div className="journal-original"><div className="journal-horizon-heading"><div><h1>{profile.title}</h1><p>{profile.subtitle}</p></div><span className="market-badge"><i/> PAPER TRADING</span></div><div className="lt on">
    <div className="lt-metrics">
      <article className="lt-card lt-cash-defense-card"><div className="lt-kicker"><span className="lt-ico">₩</span> 보유 현금</div><label className="lt-figure"><input value={state.cash.toLocaleString()} onChange={event=>setState({...state,cash:Number(event.target.value.replaceAll(',',''))||0})}/><span>원</span></label><div className="lt-defense-summary"><div><span>현금 하락 방어 예상<small>가정 하락률 {state.drawdown}%</small></span><b className="up">+{money(avoided)}</b></div><div><span>실제 매도 방어<small>매도·재매수 FIFO 기준</small></span><b className="up">+{money(actualDefense)}</b></div>{missedGain>0&&<div><span>매도 후 기회손실<small>방어액과 별도 표시</small></span><b className="down">-{money(missedGain)}</b></div>}</div><label className="lt-mini">가정 하락률<input value={state.drawdown} onChange={event=>setState({...state,drawdown:Number(event.target.value)||0})}/>%</label></article>
      <article className="lt-card"><div className="lt-kicker"><span className="lt-ico">▣</span> 총 투자 원금</div><label className="lt-figure"><input value={state.principal.toLocaleString()} onChange={event=>setState({...state,principal:Number(event.target.value.replaceAll(',',''))||0})}/><span>원</span></label><div className="lt-split"><div><p className="lt-note">현재 평가금액</p><p className="lt-strong">{money(market)}</p></div><div><p className="lt-note">평가손익</p><p className={`lt-gain ${profit<0?'down':''}`}>{profit>0?'+':''}{money(profit)}</p><p className={`lt-gain lt-rate ${rate<0?'down':''}`}>{rate>0?'+':''}{rate.toFixed(2)}%</p></div></div></article>
      <article className="lt-card lt-center"><div className="lt-kicker">현금 비중</div><div className="lt-donut" style={{'--p':Math.max(0,Math.min(100,weight))} as React.CSSProperties}><span>{weight.toFixed(1)}%</span></div><ul className="lt-legend"><li><i className="lt-dot cash"/> 보유 현금 <b>{money(state.cash)} ({weight.toFixed(0)}%)</b></li><li><i className="lt-dot stock"/> 투자 금액 <b>{money(market)} ({(100-weight).toFixed(0)}%)</b></li></ul></article>
      <article className="lt-card"><div className="lt-kicker"><span className="lt-ico">↗</span> 누적 수익률 (전체)</div><p className={`lt-hero ${rate<0?'down':''}`}>{rate>0?'+':''}{rate.toFixed(2)}%</p><svg className="lt-spark" viewBox="0 0 220 64"><polyline fill="none" stroke={rate>=0?'#16a34a':'#ef4444'} strokeWidth="2.5" points="8,54 34,50 59,47 85,39 110,35 136,28 161,22 187,15 212,10"/></svg><div className="lt-range"><span>최고 <b className="up">+{Math.max(rate,4).toFixed(2)}%</b></span><span>최저 <b className="down">-{state.drawdown.toFixed(2)}%</b></span></div></article>
    </div>
    <div className="lt-tabs">{[['hold','보유 종목'],['trades','매수/매도 기록'],['cash','현금 관리'],['goal','목표 설정'],['report','분석 리포트']].map(([key,label])=><button className="lt-tab" aria-selected={panel===key} onClick={()=>setPanel(key)} key={key}>{label}</button>)}</div>

    {panel==='hold'&&<HoldingsPanel profile={profile} state={state} visible={visible} byTicker={byTicker} setState={setState} patchHolding={patchHolding} openAdd={()=>setAddOpen(true)} openSell={setSellTarget} openDefense={setDefenseTarget}/>} 
    {panel==='trades'&&<TradesPanel state={state} setState={setState} setBuybackTarget={setBuybackTarget} setDefenseTarget={setDefenseTarget}/>} 
    {panel==='cash'&&<section className="lt-panel"><div className="lt-panelhead"><div><h2>현금 관리</h2><p>예상 방어와 실제 매도 결과는 중복을 피하기 위해 합산하지 않습니다.</p></div></div><div className="lt-defense-overview"><div><span>보유 현금</span><b>{money(state.cash)}</b></div><div><span>현금 하락 방어 예상</span><b className="up">+{money(avoided)}</b><small>가정 하락률 {state.drawdown}%</small></div><div><span>실제 매도 방어</span><b className="up">+{money(actualDefense)}</b><small>재매수 완료 + 현재가 관측</small></div><div><span>기회손실</span><b className="down">-{money(missedGain)}</b><small>매도 후 상승한 구간</small></div></div></section>}
    {panel==='goal'&&<section className="lt-panel"><div className="lt-panelhead"><div><h2>목표 설정</h2><p>목표 {profile.period}와 목표 주식 수를 정하고 비교합니다.</p></div></div><div className="lt-goalform"><label>목표 {profile.period}<input value={state.goalYears} onChange={event=>setState({...state,goalYears:Number(event.target.value)||0})}/><span>{profile.unit}</span></label><label>목표 주식 수 (전체)<input value={state.goalShares} onChange={event=>setState({...state,goalShares:Number(event.target.value)||0})}/><span>주</span></label></div></section>}
    {panel==='report'&&<section className="lt-panel"><div className="lt-panelhead"><div><h2>분석 리포트</h2><p>보유 성과와 매도 의사결정 성과를 따로 읽습니다.</p></div></div><div className="lt-report"><p>현재 평가금액은 <strong>{money(market)}</strong>이고 투자 원금 대비 수익률은 <strong>{rate.toFixed(2)}%</strong>입니다.</p><p>매도로 실제 지켜낸 금액은 <strong>+{money(actualDefense)}</strong>, 매도 후 상승으로 놓친 금액은 <b className="down">-{money(missedGain)}</b>입니다.</p><p className="lt-hint">매도 방어액은 수익이 아니라 매도하지 않았을 때와 비교한 의사결정 효과입니다.</p></div></section>}

    <div className="lt-bottom"><article className="lt-card"><h3>종목별 매도 방어 기여</h3>{state.holdings.map(row=>{const item=byTicker[row.ticker];return <button className="lt-rowline lt-rowbutton" key={row.id} onClick={()=>setDefenseTarget(row)}><div><b>{row.name} ({row.ticker})</b><span>{item?.confirmedQty||0}주 확정 · {item?.openQty||0}주 추적</span></div><div><b className="up">+{money(item?.defense||0,row.currency)}</b>{(item?.missed||0)>0&&<span className="down">기회손실 -{money(item.missed,row.currency)}</span>}</div></button>})}</article><article className="lt-card"><h3>최근 매도 이력</h3>{state.sells.slice(0,4).map(sale=><div className="lt-sellline" key={sale.id}><div><span>{sale.date}</span><b>{sale.name}</b></div><div><b>{sale.qty}주</b><span>{money(sale.price,sale.currency)}</span></div></div>)}</article><article className="lt-card"><h3>투자 목표</h3><div className="lt-goalstat"><div><span>목표 {profile.period}</span><b>{state.goalYears}</b><small>{profile.unit}</small></div><div><span>목표 주식 수</span><b>{state.goalShares}</b><small>주</small></div></div><div className="lt-bar"><i style={{width:`${Math.min(100,state.goalShares?shares/state.goalShares*100:0)}%`}}/></div><p className="lt-hint">현재 {shares}주 / {state.goalShares}주</p></article></div>
  </div>
  {addOpen&&<HoldingDialog close={()=>setAddOpen(false)} save={row=>{setState({...state,holdings:[...state.holdings,row]});setAddOpen(false)}}/>}
  {sellTarget&&<SellDialog row={sellTarget} close={()=>setSellTarget(null)} save={(qty,price,date,reason,plan)=>{setState(current=>({...current,holdings:current.holdings.map(row=>row.id===sellTarget.id?{...row,qty:row.qty-qty}:row),sells:[{id:`s${Date.now()}`,name:sellTarget.name,ticker:sellTarget.ticker,date,qty,price,currency:sellTarget.currency,reason,plan,large:qty>=sellTarget.qty*.5,buybacks:[]},...current.sells]}));setSellTarget(null);setPanel('trades')}}/>}
  {buybackTarget&&<BuybackDialog row={buybackTarget} openQty={state.sells.filter(sale=>sale.ticker===buybackTarget.ticker).reduce((sum,sale)=>sum+Math.max(0,sale.qty-sale.buybacks.reduce((used,buy)=>used+buy.qty,0)),0)} close={()=>setBuybackTarget(null)} save={(qty,price,date)=>{recordBuyback(buybackTarget,qty,price,date);setBuybackTarget(null)}}/>}
  {defenseTarget&&<DefenseDialog row={defenseTarget} sells={state.sells.filter(sale=>sale.ticker===defenseTarget.ticker)} close={()=>setDefenseTarget(null)} onBuyback={()=>{setBuybackTarget(defenseTarget);setDefenseTarget(null)}}/>}
  </div>;
}

function HoldingsPanel({profile,state,visible,byTicker,setState,patchHolding,openAdd,openSell,openDefense}:{profile:typeof profiles[Horizon];state:PageState;visible:Holding[];byTicker:Record<string,Defense>;setState:React.Dispatch<React.SetStateAction<PageState>>;patchHolding:(id:string,field:keyof Holding,value:number)=>void;openAdd:()=>void;openSell:(row:Holding)=>void;openDefense:(row:Holding)=>void}) {
  return <section className="lt-panel"><div className="lt-panelhead"><div><h2>보유 종목</h2><p>평가손익과 매도 이후 지켜낸 금액을 분리해 확인할 수 있습니다.</p></div><div className="lt-tools"><select value={state.sector} onChange={event=>setState({...state,sector:event.target.value})}><option value="">전체 섹터</option>{[...new Set(state.holdings.map(row=>row.sector))].map(name=><option key={name}>{name}</option>)}</select><button className="lt-btn primary" onClick={openAdd}>+ 종목 추가</button></div></div><div className="lt-tablewrap"><table className="lt-defense-table"><thead><tr><th>#</th><th>종목명</th><th>현재가</th><th>보유 수량</th><th>평균단가</th><th>평가금액</th><th>평가손익 · 매도 방어</th><th>최대 보유 수량</th><th>목표 주식 수</th><th>{profile.period}</th><th>메모</th><th/></tr></thead><tbody>{visible.map((row,index)=>{
    const value=row.price*row.qty,cost=row.avg*row.qty,itemProfit=value-cost,itemRate=cost?itemProfit/cost*100:0;
    const defense=byTicker[row.ticker]||{defense:0,missed:0,confirmedQty:0,openQty:0,calculable:false};
    return <tr key={row.id}><td>{index+1}</td><td><div className="lt-name"><span className="lt-mark">{row.name[0]}</span><div>{row.name}<small>{row.ticker} · {row.market}</small></div></div></td>{(['price','qty','avg'] as const).map(field=><td key={field}><input className="lt-cellinput" value={row[field]} onChange={event=>patchHolding(row.id,field,Number(event.target.value)||0)}/>{field!=='qty'&&<small className="lt-sub">{row.currency}</small>}</td>)}<td>{money(value,row.currency)}</td><td className="lt-performance"><b className={itemProfit>=0?'up':'down'}>{itemProfit>0?'+':''}{money(itemProfit,row.currency)}</b><small className={itemRate>=0?'up':'down'}>{itemRate>0?'+':''}{itemRate.toFixed(1)}%</small><button className="lt-defense-link" onClick={()=>openDefense(row)}>{defense.defense>0?<>매도 방어 <strong>+{money(defense.defense,row.currency)}</strong></>:defense.missed>0?<>기회손실 <strong className="down">-{money(defense.missed,row.currency)}</strong></>:<>매도 방어 <strong>—</strong></>}<span>{defense.openQty+defense.confirmedQty}주 추적 · 상세 ›</span></button></td><td>{row.maxQty}주<small className="lt-sub">{row.maxDate}</small></td><td><input className="lt-cellinput" value={row.targetQty} onChange={event=>patchHolding(row.id,'targetQty',Number(event.target.value)||0)}/></td><td><input className="lt-cellinput" value={row.years} onChange={event=>patchHolding(row.id,'years',Number(event.target.value)||0)}/></td><td><button className="lt-link" onClick={()=>{const text=prompt('메모를 줄바꿈으로 입력하세요.',row.memos.join('\n'));if(text!=null)setState({...state,holdings:state.holdings.map(item=>item.id===row.id?{...item,memos:text.split('\n').filter(Boolean)}:item)})}}>메모 ({row.memos.length})</button></td><td><button className="lt-link" onClick={()=>openSell(row)}>매도</button></td></tr>;
  })}</tbody></table></div></section>;
}

function TradesPanel({state,setState,setBuybackTarget,setDefenseTarget}:{state:PageState;setState:React.Dispatch<React.SetStateAction<PageState>>;setBuybackTarget:(row:Holding)=>void;setDefenseTarget:(row:Holding)=>void}) {
  return <section className="lt-panel"><div className="lt-panelhead"><div><h2>매수/매도 기록</h2><p>매도 체결가와 재매수를 연결해 방어액을 자동 계산합니다.</p></div></div><div className="lt-feed lt-trade-feed">{state.sells.length?state.sells.map(sale=>{
    const holding=state.holdings.find(row=>row.ticker===sale.ticker);
    const item=metric(sale,holding?.price||0);
    return <article key={sale.id}><div className="lt-trade-head"><div><h3>{sale.name} <small>{sale.ticker}</small> {sale.large&&<span className="lt-badge">대량 청산</span>}</h3><p>{sale.date} · {sale.price>0?money(sale.price,sale.currency):'매도가 미입력'} × {sale.qty}주 매도</p></div><div className="lt-effect-pills">{item.defense>0&&<span className="positive">방어 +{money(item.defense,sale.currency)}</span>}{item.missed>0&&<span className="negative">기회손실 -{money(item.missed,sale.currency)}</span>}{!item.calculable&&<span>매도가 확인 필요</span>}</div></div><div className="lt-trade-copy"><p><b>매도 이유</b>{sale.reason}</p><p><b>다시 모아갈 계획</b>{sale.plan}</p></div><div className="lt-trade-foot"><span>확정 {item.confirmedQty}주 · 추적 중 {item.openQty}주</span>{sale.price<=0&&<button className="lt-btn" onClick={()=>{const value=Number(prompt(`매도 체결가 (${sale.currency})를 입력하세요.`));if(value>0)setState(current=>({...current,sells:current.sells.map(item=>item.id===sale.id?{...item,price:value}:item)}))}}>매도가 입력</button>}{holding&&item.openQty>0&&<button className="lt-btn" onClick={()=>setBuybackTarget(holding)}>재매수 기록</button>}<button className="lt-link" disabled={!holding} onClick={()=>holding&&setDefenseTarget(holding)}>계산 상세</button></div></article>;
  }):<p>아직 매도 기록이 없습니다.</p>}</div></section>;
}

function HoldingDialog({close,save}:{close:()=>void;save:(row:Holding)=>void}) {
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const data=new FormData(event.currentTarget);const qty=Number(data.get('qty'))||0;save({id:`h${Date.now()}`,name:String(data.get('name')),ticker:String(data.get('ticker')).toUpperCase(),market:String(data.get('market')||'한국'),sector:String(data.get('sector')||''),currency:data.get('currency')==='USD'?'USD':'KRW',price:Number(data.get('price'))||0,avg:Number(data.get('avg'))||0,qty,maxQty:qty,maxDate:today(),targetQty:Number(data.get('targetQty'))||0,years:Number(data.get('years'))||0,memos:[]})};
  return <div className="lt-dialog" role="dialog" aria-modal="true"><form className="lt-dialogbox" onSubmit={submit}><h3>종목 추가</h3>{[['name','종목명'],['ticker','티커'],['market','시장'],['sector','섹터'],['price','현재가'],['avg','평균단가'],['qty','보유 수량'],['targetQty','목표 주식 수'],['years','투자 기간']].map(([name,label])=><label key={name}>{label}<input name={name} type={['price','avg','qty','targetQty','years'].includes(name)?'number':'text'} step="any" required={['name','ticker','price','avg','qty'].includes(name)}/></label>)}<label>통화<select name="currency"><option>KRW</option><option>USD</option></select></label><div className="lt-dialogactions"><button type="button" className="lt-btn" onClick={close}>취소</button><button className="lt-btn primary">추가</button></div></form></div>;
}

function SellDialog({row,close,save}:{row:Holding;close:()=>void;save:(qty:number,price:number,date:string,reason:string,plan:string)=>void}) {
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const data=new FormData(event.currentTarget),qty=Number(data.get('qty'))||0,price=Number(data.get('price'))||0;if(qty<=0||qty>row.qty){alert('매도 수량은 보유 수량 이하로 입력해 주세요.');return}if(price<=0){alert('매도 체결가를 입력해 주세요.');return}save(qty,price,String(data.get('date')),String(data.get('reason')),String(data.get('plan')))};
  return <div className="lt-dialog" role="dialog" aria-modal="true"><form className="lt-dialogbox" onSubmit={submit}><DialogTitle kicker="SELL" title={`${row.name} 매도 기록`} close={close}/><p className="lt-dialog-help">매도 체결가를 현재가 또는 재매수가와 비교해 방어액을 계산합니다.</p><div className="lt-dialog-grid"><label>매도일<input name="date" type="date" defaultValue={today()} required/></label><label>매도 수량<input name="qty" type="number" min="0" max={row.qty} step="any" placeholder={`최대 ${row.qty}주`} required/></label><label className="wide">매도 체결가 ({row.currency})<input name="price" type="number" min="0" step="any" defaultValue={row.price} required/></label></div><label>매도 이유<textarea name="reason" required/></label><label>다시 모아갈 계획<textarea name="plan" required/></label><div className="lt-formula-note"><b>진행 중 방어액</b> (매도가 − 현재가) × 미재매수 수량</div><div className="lt-dialogactions"><button type="button" className="lt-btn" onClick={close}>취소</button><button className="lt-btn primary">매도 기록</button></div></form></div>;
}

function BuybackDialog({row,openQty,close,save}:{row:Holding;openQty:number;close:()=>void;save:(qty:number,price:number,date:string)=>void}) {
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const data=new FormData(event.currentTarget),qty=Number(data.get('qty'))||0,price=Number(data.get('price'))||0;if(qty<=0||qty>openQty){alert(`재매수 수량은 추적 중인 ${openQty}주 이하로 입력해 주세요.`);return}if(price<=0){alert('재매수 체결가를 입력해 주세요.');return}save(qty,price,String(data.get('date')))};
  return <div className="lt-dialog" role="dialog" aria-modal="true"><form className="lt-dialogbox" onSubmit={submit}><DialogTitle kicker="BUY BACK · FIFO" title={`${row.name} 재매수 기록`} close={close}/><p className="lt-dialog-help">오래된 미재매수 매도분부터 연결됩니다. 연결되는 순간 해당 수량의 방어액이 확정됩니다.</p><div className="lt-open-qty"><span>현재 추적 중</span><b>{openQty}주</b></div><div className="lt-dialog-grid"><label>재매수일<input name="date" type="date" defaultValue={today()} required/></label><label>재매수 수량<input name="qty" type="number" min="0" max={openQty} step="any" required/></label><label className="wide">재매수 체결가 ({row.currency})<input name="price" type="number" min="0" step="any" defaultValue={row.price} required/></label></div><div className="lt-formula-note"><b>확정 방어액</b> (매도가 − 재매수가) × 재매수 수량</div><div className="lt-dialogactions"><button type="button" className="lt-btn" onClick={close}>취소</button><button className="lt-btn primary">FIFO로 연결</button></div></form></div>;
}

function DialogTitle({kicker,title,close}:{kicker:string;title:string;close:()=>void}) { return <div className="lt-dialog-title"><div><span>{kicker}</span><h3>{title}</h3></div><button type="button" onClick={close} aria-label="닫기">×</button></div>; }

function DefenseDialog({row,sells,close,onBuyback}:{row:Holding;sells:Sale[];close:()=>void;onBuyback:()=>void}) {
  const total=sells.reduce<Defense>((sum,sale)=>{const item=metric(sale,row.price);return {defense:sum.defense+item.defense,missed:sum.missed+item.missed,confirmedQty:sum.confirmedQty+item.confirmedQty,openQty:sum.openQty+item.openQty,calculable:sum.calculable||item.calculable}},{defense:0,missed:0,confirmedQty:0,openQty:0,calculable:false});
  return <div className="lt-dialog" role="dialog" aria-modal="true"><div className="lt-dialogbox lt-defense-dialog"><div className="lt-dialog-title"><div><span>SELL DEFENSE</span><h3>{row.name} 매도 방어 상세</h3><p>{row.ticker} · 현재가 {money(row.price,row.currency)}</p></div><button type="button" onClick={close} aria-label="닫기">×</button></div><div className="lt-defense-total"><div><span>누적 방어액</span><b className="up">+{money(total.defense,row.currency)}</b></div><div><span>누적 기회손실</span><b className="down">-{money(total.missed,row.currency)}</b></div><div><span>매칭 현황</span><b>{total.confirmedQty}주 확정 · {total.openQty}주 추적</b></div></div><div className="lt-lot-list">{sells.length?sells.map(sale=>{const item=metric(sale,row.price);return <article key={sale.id}><div className="lt-lot-head"><div><b>{sale.date}</b><span>{sale.price>0?money(sale.price,sale.currency):'매도가 미입력'} × {sale.qty}주 매도</span></div><div>{item.defense>0&&<b className="up">+{money(item.defense,sale.currency)}</b>}{item.missed>0&&<small className="down">기회손실 -{money(item.missed,sale.currency)}</small>}</div></div>{sale.buybacks.map(buy=>{const effect=(sale.price-buy.price)*buy.qty;return <div className="lt-match-row" key={buy.id}><span><i className="confirmed"/>{buy.date} 재매수 {buy.qty}주 · {money(buy.price,sale.currency)}</span><b className={effect>=0?'up':'down'}>{effect>=0?'방어 +':'기회손실 -'}{money(Math.abs(effect),sale.currency)}</b></div>})}{item.openQty>0&&<div className="lt-match-row"><span><i/>현재가까지 추적 중 {item.openQty}주 · {money(row.price,row.currency)}</span><b>미확정</b></div>}</article>}):<div className="lt-empty-defense"><b>아직 매도 기록이 없습니다.</b><p>종목을 매도할 때 체결가를 남기면 방어 효과가 여기에 표시됩니다.</p></div>}</div><div className="lt-dialogactions"><button type="button" className="lt-btn" onClick={close}>닫기</button>{total.openQty>0&&<button type="button" className="lt-btn primary" onClick={onBuyback}>재매수 기록</button>}</div></div></div>;
}
