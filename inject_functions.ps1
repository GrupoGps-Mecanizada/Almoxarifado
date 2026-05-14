# Reads the file, finds the exportAll closing brace line, inserts new functions after it
$file = "index.html"
$enc  = [System.Text.Encoding]::UTF8
$lines = [System.IO.File]::ReadAllLines($file, $enc)

# Find the line "        }" that closes exportAll() — it comes after exportStockToXLSX();
# We look for the pattern: previous line has exportStockToXLSX and next meaningful thing is the init comment
$insertAfter = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*exportStockToXLSX\(\);') {
        # the closing brace of exportAll is 2 lines after
        $insertAfter = $i + 2
        break
    }
}

if ($insertAfter -lt 0) {
    Write-Error "Could not find insertion point"
    exit 1
}

Write-Host "Inserting after line $($insertAfter + 1)"

$newCode = @'

        // ============================================
        // COPIAR RELATORIO PARA WHATSAPP
        // ============================================
        function copiarRelatorioWhatsApp() {
            var result = state.contagem.savedResult;
            var rSess  = state.contagem.currentSession;
            var sessId = state.contagem.turno || '';
            if (!result) return;
            var c1h = (rSess && rSess.c1_horario) ? rSess.c1_horario : '00:00';
            var c2h = (rSess && rSess.c2_horario) ? rSess.c2_horario : '07:00';
            var c3h = (rSess && rSess.c3_horario) ? rSess.c3_horario : '08:00';
            var dataFmt = formatDate(state.contagem.date);
            var sep = '-------------------------------';
            var txt = 'RELATORIO DA SESSAO' + (sessId ? ' - ' + sessId : '') + '\n';
            txt += 'Data: ' + dataFmt + '\nC1: ' + c1h + ' | C2: ' + c2h + ' | C3: ' + c3h + '\n';
            var noiteLabel = rSess
                ? 'LETRA ' + rSess.turno_noite + ' - HORARIO: ' + c1h + ' A ' + c2h
                : 'TURNO NOITE';
            var totalC1C2 = result.reduce(function(a,r){return a+((r.c1_qtd!=null&&r.c2_qtd!=null)?Math.max(0,r.c1_qtd-r.c2_qtd):0);},0);
            txt += '\n' + noiteLabel + '\nConsumo = C1 - C2\n' + sep + '\n';
            result.forEach(function(r){
                var cons=(r.c1_qtd!=null&&r.c2_qtd!=null)?Math.max(0,r.c1_qtd-r.c2_qtd):null;
                if(!cons)return;
                var nm=String(r.item_name); while(nm.length<24)nm+=' ';
                txt+=nm+' C1:'+(r.c1_qtd!=null?r.c1_qtd:'-')+' | C2:'+(r.c2_qtd!=null?r.c2_qtd:'-')+' | Consumido: '+cons+'\n';
            });
            txt+=sep+'\nTotal consumido: '+totalC1C2+' unid\n';
            var diaLabel=rSess?'ADM + LETRA '+rSess.turno_dia+' - HORARIO: '+c2h+' AS '+c3h:'ADM + TURNO DIA';
            var totalC2C3=result.reduce(function(a,r){return a+((r.c2_qtd!=null&&r.c3_qtd!=null)?Math.max(0,r.c2_qtd-r.c3_qtd):0);},0);
            txt+='\n'+diaLabel+'\nDistribuicao = C2 - C3\n'+sep+'\n';
            result.forEach(function(r){
                var dist=(r.c2_qtd!=null&&r.c3_qtd!=null)?Math.max(0,r.c2_qtd-r.c3_qtd):null;
                if(!dist)return;
                var nm=String(r.item_name); while(nm.length<24)nm+=' ';
                txt+=nm+' C2:'+(r.c2_qtd!=null?r.c2_qtd:'-')+' | C3:'+(r.c3_qtd!=null?r.c3_qtd:'-')+' | Distribuido: '+dist+'\n';
            });
            txt+=sep+'\nTotal distribuido: '+totalC2C3+' unid\n';
            navigator.clipboard.writeText(txt)
                .then(function(){showToast('Relatorio copiado! Cole no WhatsApp.','success');})
                .catch(function(){showToast('Erro ao copiar. Tente novamente.','error');});
        }

        // ============================================
        // DASHBOARD EPI
        // ============================================
        async function navigateToEpiDashboard() {
            state.view = 'epi_dashboard';
            if (!state.dashboard) {
                state.dashboard = { loading: false, data: [], period: '30d' };
            }
            render();
            await loadDashboardData();
        }

        async function loadDashboardData() {
            if (!state.dashboard) return;
            state.dashboard.loading = true;
            render();
            try {
                var p = state.dashboard.period;
                var query = sbClient.from('daily_counts').select('*').order('date', { ascending: false });
                if (p !== 'all') {
                    var days = p === '7d' ? 7 : p === '30d' ? 30 : 90;
                    var since = new Date();
                    since.setDate(since.getDate() - days);
                    query = query.gte('date', since.toISOString().split('T')[0]);
                }
                var res = await query;
                state.dashboard.data = res.data || [];
            } catch(e) { state.dashboard.data = []; }
            state.dashboard.loading = false;
            render();
            renderDashboardCharts();
        }

        function renderEpiDashboard() {
            var dash = state.dashboard || { loading: false, data: [], period: '30d' };
            var rows = dash.data || [];
            var byItem = {}, byTurno = { A:0, B:0, C:0, D:0, ADM:0 };
            rows.forEach(function(r) {
                var cons = (r.c1_qtd!=null&&r.c2_qtd!=null)?Math.max(0,r.c1_qtd-r.c2_qtd):0;
                var dist = (r.c2_qtd!=null&&r.c3_qtd!=null)?Math.max(0,r.c2_qtd-r.c3_qtd):0;
                if (!byItem[r.item_name]) byItem[r.item_name]={consumo:0,distAdm:0};
                byItem[r.item_name].consumo+=cons; byItem[r.item_name].distAdm+=dist;
                var t = r.turno||'';
                ['A','B','C','D'].forEach(function(k){if(t===k)byTurno[k]+=cons;});
                byTurno.ADM+=dist;
            });
            var top10 = Object.entries(byItem)
                .sort(function(a,b){return (b[1].consumo+b[1].distAdm)-(a[1].consumo+a[1].distAdm);})
                .slice(0,10);
            var totalEPIs  = top10.reduce(function(s,e){return s+e[1].consumo+e[1].distAdm;},0);
            var totalNoite = byTurno.A+byTurno.B+byTurno.C+byTurno.D;
            var periodOpts = [['7d','7 dias'],['30d','30 dias'],['90d','90 dias'],['all','Tudo']];
            return `
            <div class="page-wrap">
                ${renderHeader()}
                <div class="page-content">
                    <div class="row-between" style="margin-bottom:16px;">
                        <h1 class="page-title"><i class="ph ph-chart-bar" style="color:var(--accent);"></i> Dashboard EPI</h1>
                        <button onclick="loadDashboardData()" class="btn-secondary" ${dash.loading?'disabled':''}>
                            <i class="ph ph-arrows-clockwise"></i> Atualizar
                        </button>
                    </div>
                    <div class="card" style="margin-bottom:14px;">
                        <div class="section-title" style="margin-bottom:10px;">Periodo</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            ${periodOpts.map(([v,l]) => `
                                <button onclick="state.dashboard.period='${v}';loadDashboardData()"
                                    style="padding:6px 18px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;
                                           border:1.5px solid ${dash.period===v?'var(--accent)':'var(--border)'};
                                           background:${dash.period===v?'var(--accent)':'transparent'};
                                           color:${dash.period===v?'#fff':'var(--text-2)'};">${l}
                                </button>`).join('')}
                        </div>
                    </div>
                    ${dash.loading ? `
                    <div class="card" style="text-align:center;padding:48px;">
                        <div class="loading-spinner" style="margin:0 auto 16px;"></div>
                        <p style="color:var(--text-2);">Carregando dados...</p>
                    </div>` : `
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:14px;">
                        <div class="card" style="text-align:center;padding:16px 12px;">
                            <div style="font-size:30px;font-weight:800;color:var(--accent);">${totalEPIs}</div>
                            <div style="font-size:11px;color:var(--text-3);margin-top:4px;">EPIs Distribuidos</div>
                        </div>
                        <div class="card" style="text-align:center;padding:16px 12px;">
                            <div style="font-size:30px;font-weight:800;color:var(--red);">${totalNoite}</div>
                            <div style="font-size:11px;color:var(--text-3);margin-top:4px;">Consumo Turno Noite</div>
                        </div>
                        <div class="card" style="text-align:center;padding:16px 12px;">
                            <div style="font-size:30px;font-weight:800;color:var(--orange);">${byTurno.ADM||0}</div>
                            <div style="font-size:11px;color:var(--text-3);margin-top:4px;">Dist. ADM + Dia</div>
                        </div>
                        <div class="card" style="text-align:center;padding:16px 12px;">
                            <div style="font-size:30px;font-weight:800;color:var(--green);">${top10.length}</div>
                            <div style="font-size:11px;color:var(--text-3);margin-top:4px;">Itens com Movimento</div>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
                        <div class="card" style="padding:16px;">
                            <div class="section-title" style="margin-bottom:10px;">Top 10 Itens Consumidos</div>
                            <div style="position:relative;height:220px;"><canvas id="dash-chart-top"></canvas></div>
                        </div>
                        <div class="card" style="padding:16px;">
                            <div class="section-title" style="margin-bottom:10px;">Distribuicao por Turno</div>
                            <div style="position:relative;height:220px;"><canvas id="dash-chart-turno"></canvas></div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="section-title" style="margin-bottom:12px;">Ranking de Consumo</div>
                        <div style="overflow-x:auto;">
                            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                                <thead><tr style="background:var(--bg-2);border-bottom:2px solid var(--border);">
                                    <th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--text-3);">#</th>
                                    <th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--text-3);">Item</th>
                                    <th style="padding:8px 10px;text-align:right;font-size:11px;color:var(--text-3);">Cons. Noite</th>
                                    <th style="padding:8px 10px;text-align:right;font-size:11px;color:var(--text-3);">Dist. ADM</th>
                                    <th style="padding:8px 10px;text-align:right;font-size:11px;color:var(--text-3);">Total</th>
                                </tr></thead>
                                <tbody>
                                    ${top10.map(([nome,v],i) => `
                                    <tr style="border-bottom:1px solid var(--border);">
                                        <td style="padding:10px;color:var(--text-3);font-weight:700;">${i+1}</td>
                                        <td style="padding:10px;font-weight:600;">${nome}</td>
                                        <td style="padding:10px;text-align:right;color:var(--red);font-weight:700;">${v.consumo}</td>
                                        <td style="padding:10px;text-align:right;color:var(--orange);font-weight:700;">${v.distAdm}</td>
                                        <td style="padding:10px;text-align:right;font-weight:800;">${v.consumo+v.distAdm}</td>
                                    </tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>`}
                </div>
            </div>`;
        }

        function renderDashboardCharts() {
            if (state.view !== 'epi_dashboard') return;
            var rows = (state.dashboard||{}).data || [];
            var byItem = {}, byTurno = { A:0, B:0, C:0, D:0, ADM:0 };
            rows.forEach(function(r) {
                var cons=(r.c1_qtd!=null&&r.c2_qtd!=null)?Math.max(0,r.c1_qtd-r.c2_qtd):0;
                var dist=(r.c2_qtd!=null&&r.c3_qtd!=null)?Math.max(0,r.c2_qtd-r.c3_qtd):0;
                if(!byItem[r.item_name])byItem[r.item_name]=0;
                byItem[r.item_name]+=cons+dist;
                var t=r.turno||'';
                ['A','B','C','D'].forEach(function(k){if(t===k)byTurno[k]+=cons;});
                byTurno.ADM+=dist;
            });
            var top10=Object.entries(byItem).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
            var ctxTop=document.getElementById('dash-chart-top');
            if(ctxTop){
                if(ctxTop._chart)ctxTop._chart.destroy();
                ctxTop._chart=new Chart(ctxTop,{
                    type:'bar',
                    data:{labels:top10.map(function(e){var n=e[0];return n.length>18?n.slice(0,18)+'...':n;}),
                          datasets:[{label:'Total',data:top10.map(function(e){return e[1];}),
                              backgroundColor:'rgba(99,102,241,0.8)',borderRadius:6}]},
                    options:{indexAxis:'y',plugins:{legend:{display:false}},
                        responsive:true,maintainAspectRatio:false,
                        scales:{x:{grid:{color:'rgba(0,0,0,0.05)'}},y:{grid:{display:false}}}}
                });
            }
            var ctxT=document.getElementById('dash-chart-turno');
            if(ctxT){
                if(ctxT._chart)ctxT._chart.destroy();
                var labels=Object.keys(byTurno).filter(function(k){return byTurno[k]>0;});
                var colors=['#6366f1','#f59e0b','#ef4444','#10b981','#64748b'];
                ctxT._chart=new Chart(ctxT,{
                    type:'doughnut',
                    data:{labels:labels.map(function(l){return l==='ADM'?'ADM/Dia':'Turno '+l;}),
                          datasets:[{data:labels.map(function(l){return byTurno[l];}),
                              backgroundColor:colors.slice(0,labels.length),borderWidth:2}]},
                    options:{plugins:{legend:{position:'bottom'}},responsive:true,maintainAspectRatio:false}
                });
            }
        }
'@

# Build output array: lines before insertion + new code lines + remaining lines
$newLines = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -le $insertAfter; $i++) {
    $newLines.Add($lines[$i])
}
$newCode.Split("`n") | ForEach-Object { $newLines.Add($_) }
for ($i = $insertAfter + 1; $i -lt $lines.Count; $i++) {
    $newLines.Add($lines[$i])
}

[System.IO.File]::WriteAllLines($file, $newLines, $enc)
Write-Host "Done. New file has $($newLines.Count) lines."
