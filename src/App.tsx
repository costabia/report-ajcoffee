import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import './App.scss';
import logo from './assets/logo.svg';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
  ChartDataLabels
);

// Defaults do ChartJS para combinar com o layout
ChartJS.defaults.color = '#5a4a3a';
ChartJS.defaults.font.family = "'IBM Plex Mono', monospace";
ChartJS.defaults.font.size = 11;

type StatData = {
  price: string;
  min: string;
  max: string;
  changeStr: string;
  changeType: 'up' | 'down' | 'neutral';
};

type ChartData = {
  labels: string[];
  prices: number[];
};

const toDateStr = (d: Date) => d.toISOString().split('T')[0];

const App: React.FC = () => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeFilter, setActiveFilter] = useState(90);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('—');

  const [coffeeStats, setCoffeeStats] = useState<StatData | null>(null);
  const [dollarStats, setDollarStats] = useState<StatData | null>(null);
  const [coffeeChart, setCoffeeChart] = useState<ChartData | null>(null);
  const [dollarChart, setDollarChart] = useState<ChartData | null>(null);

  const [loadingCoffee, setLoadingCoffee] = useState(true);
  const [errorCoffee, setErrorCoffee] = useState(false);
  const [loadingDollar, setLoadingDollar] = useState(true);
  const [errorDollar, setErrorDollar] = useState(false);

  // Referência para a área que será capturada no PDF
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 90);
    setDateFrom(toDateStr(from));
    setDateTo(toDateStr(to));
  }, []);

  const setRange = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateFrom(toDateStr(from));
    setDateTo(toDateStr(to));
    setActiveFilter(days);
  };

  const loadDollar = async (fromStr: string, toStr: string) => {
    setLoadingDollar(true);
    setErrorDollar(false);

    const fmt = (d: string) => {
      const [y, m, dd] = d.split('-');
      return `${m}-${dd}-${y}`;
    };

    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${fmt(fromStr)}'&@dataFinalCotacao='${fmt(toStr)}'&$top=10000&$format=json&$select=cotacaoCompra,dataHoraCotacao`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('BCB API error');
      const json = await res.json();
      const raw = json.value;

      if (!raw || raw.length === 0) throw new Error('Sem dados');

      const byDate: Record<string, number> = {};
      raw.forEach((r: any) => {
        const date = r.dataHoraCotacao.split(' ')[0];
        byDate[date] = r.cotacaoCompra;
      });

      const dates = Object.keys(byDate).sort();
      const prices = dates.map(d => byDate[d]);

      const last = prices[prices.length - 1];
      const prev = prices[prices.length - 2] || last;
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const chg = ((last - prev) / prev * 100);

      setDollarStats({
        price: `R$ ${last.toFixed(4)}`,
        min: `R$ ${min.toFixed(4)}`,
        max: `R$ ${max.toFixed(4)}`,
        changeStr: `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% hoje`,
        changeType: chg > 0 ? 'up' : chg < 0 ? 'down' : 'neutral'
      });

      const labels = dates.map(d => {
        const [y, m, dd] = d.split('-');
        return `${dd}/${m}/${y.slice(2)}`;
      });

      setDollarChart({ labels, prices });
    } catch (e) {
      console.error('Dollar error:', e);
      setErrorDollar(true);
    } finally {
      setLoadingDollar(false);
    }
  };

const loadCoffee = async (fromStr: string, toStr: string) => {
    setLoadingCoffee(true);
    setErrorCoffee(false);

    const fromTs = Math.floor(new Date(fromStr).getTime() / 1000);
    const toTs = Math.floor(new Date(toStr + 'T23:59:59').getTime() / 1000);
    
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/KC%3DF?period1=${fromTs}&period2=${toTs}&interval=1d&includePrePost=false`;

    const parseAndSetCoffeeData = (json: any) => {
      const result = json.chart?.result?.[0];
      if (!result) throw new Error('Estrutura de dados inválida');

      const timestamps: number[] = result.timestamp;
      const closes: number[] = result.indicators.quote[0].close;

      if (!timestamps || !closes) throw new Error('Dados vazios');

      const pairs = timestamps.map((t, i) => ({ t, v: closes[i] })).filter(p => p.v != null);

      const labels = pairs.map(p => {
        const d = new Date(p.t * 1000);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
      });
      const prices = pairs.map(p => p.v);

      const last = prices[prices.length - 1];
      const prev = prices[prices.length - 2] || last;
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const chg = ((last - prev) / prev * 100);

      setCoffeeStats({
        price: `${last.toFixed(2)}¢`,
        min: `${min.toFixed(2)}¢`,
        max: `${max.toFixed(2)}¢`,
        changeStr: `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% hoje`,
        changeType: chg > 0 ? 'up' : chg < 0 ? 'down' : 'neutral'
      });

      setCoffeeChart({ labels, prices });
    };

    // Tentativa 1: Direta (Pode falhar por CORS)
    try {
      const res = await fetch(targetUrl);
      if (res.ok) {
        const json = await res.json();
        parseAndSetCoffeeData(json);
        setLoadingCoffee(false);
        return;
      }
    } catch (e) {
      console.warn('Tentativa direta bloqueada por CORS. Tentando Proxy 1...');
    }

    // Tentativa 2: Corsproxy.io (Excelente estabilidade)
    try {
      const proxyUrl1 = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl1);
      if (res.ok) {
        const json = await res.json();
        parseAndSetCoffeeData(json);
        setLoadingCoffee(false);
        return;
      }
    } catch (e) {
      console.warn('Proxy 1 falhou. Tentando Proxy 2 (AllOrigins)...');
    }

    // Tentativa 3: AllOrigins (Fallback final)
    try {
      const proxyUrl2 = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl2);
      if (res.ok) {
        const outerJson = await res.json();
        const json = JSON.parse(outerJson.contents);
        parseAndSetCoffeeData(json);
        setLoadingCoffee(false);
        return;
      }
    } catch (err) {
      console.error('Todos os métodos de busca falharam:', err);
      setErrorCoffee(true);
    } finally {
      setLoadingCoffee(false);
    }
  };

  const loadAllData = useCallback(async () => {
    if (!dateFrom || !dateTo) {
      alert('Selecione as datas');
      return;
    }
    if (dateFrom > dateTo) {
      alert('Data inicial deve ser antes da data final');
      return;
    }

    setIsUpdating(true);
    setLastUpdate(new Date().toLocaleString('pt-BR'));

    await Promise.all([
      loadCoffee(dateFrom, dateTo),
      loadDollar(dateFrom, dateTo)
    ]);

    setIsUpdating(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (dateFrom && dateTo) {
      loadAllData();
    }
  }, [dateFrom, dateTo]);

  // Função para gerar o PDF
  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    
    setIsGeneratingPDF(true);
    try {
      // Tira um "print" do elemento referenciado
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, // Maior resolução
        backgroundColor: '#0d0b08', // Mantém o fundo escuro do tema
      });
      
      const imgData = canvas.toDataURL('image/png');
      
      // Cria o documento PDF em formato A4 retrato
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      // Calcula a altura proporcional da imagem capturada
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
      pdf.save(`relatorio-mercado-${dateFrom}-a-${dateTo}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar o PDF:', error);
      alert('Ocorreu um erro ao gerar o PDF.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

const generateChartConfig = (data: ChartData | null, color: string, labelText: string, prefix = '', suffix = '') => {
    if (!data) return null;

    return {
      data: {
        labels: data.labels,
        datasets: [{
          label: labelText,
          data: data.prices,
          borderColor: color,
          borderWidth: 2,
          fill: true,
          tension: 0.1, // Quase reto, como na sua imagem
          pointRadius: 3, // Coloquei um ponto pequeno para ancorar o texto visualmente
          pointBackgroundColor: color,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        events: [], // Mantém estático para o PDF
       
        // Adiciona um espaço extra no topo para o número não cortar
        layout: {
          padding: { top: 25, right: 20 }
        },
       
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }, // Tooltip desligado
         
          // CONFIGURAÇÃO DOS VALORES NA TELA
          datalabels: {
            display: true,
            color: '#2e200c', // Cor do texto igual a do seu tema claro
            align: 'top',     // Posiciona acima do ponto
            offset: 6,        // Distância do ponto
            font: {
              family: "'IBM Plex Mono', monospace",
              size: 11,
              weight: 'bold' as const // Deixa o número em destaque
            },
            formatter: (value: number) => {
              // Formata para o padrão brasileiro (ex: 145,85)
              // Se quiser colocar o R$ ou o ¢ direto no número, use: return `${prefix}${value.toFixed(2).replace('.', ',')}${suffix}`
              return value.toFixed(2).replace('.', ',');
            }
          }
        },
        scales: {
          x: {
            border: { color: '#2e2720' },
            ticks: {
              color: '#473b2f',
              maxTicksLimit: 8,
              maxRotation: 0,
            }
          },
          y: {
            border: { color: '#2e2720' },
            ticks: { color: '#33271a' }
          }
        }
      }
    };
  };

  const coffeeConfig = generateChartConfig(coffeeChart, '#c8864a', 'KC Futures', '', '¢');
  const dollarConfig = generateChartConfig(dollarChart, '#4ab8c8', 'USD/BRL', 'R$ ');

  return (
    <>
      <header>
        <div className="header-title">
          <img src={logo} alt="Logo" className='imagem'/>
          <p className="header-subtitle">NY Coffee C® Futures · USD/BRL · Dados de Mercado</p>
        </div>
      </header>

      <div className="main">
        <div className="filter-panel">
          <span className="filter-label">Período</span>
          <div className="filter-group">
            <div className="date-field">
              <label>De</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <span className="separator">→</span>
            <div className="date-field">
              <label>Até</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="quick-filters">
            {[7, 30, 90, 180, 365, 730].map(days => (
              <button 
                key={days}
                className={`quick-btn ${activeFilter === days ? 'active' : ''}`} 
                onClick={() => setRange(days)}
              >
                {days === 30 ? '1M' : days === 90 ? '3M' : days === 180 ? '6M' : days === 365 ? '1A' : days === 730 ? '2A' : '7D'}
              </button>
            ))}
          </div>
          
          {/* Agrupamento de botões de ação */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
            <button 
              className="btn-update" 
              style={{ marginLeft: 0, background: 'white', color: 'var(--background)' }}
              onClick={handleDownloadPDF} 
              disabled={isGeneratingPDF || loadingCoffee || loadingDollar}
            >
              {isGeneratingPDF ? 'Gerando...' : 'Baixar PDF'}
            </button>

            <button 
              className="btn-update"
              style={{ marginLeft: 0 }}
              onClick={loadAllData} 
              disabled={isUpdating}
            >
              {isUpdating ? '⏳ Carregando...' : '▶ Atualizar'}
            </button>
          </div>
        </div>

        {/* Div encapsulando o que vai pro PDF */}
        <div ref={reportRef} style={{ padding: '10px', background: 'var(--bg)' }}>

          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="chart-title coffee">☕ NY Coffee C® Futures</div>
                  <div className="chart-meta">ICE · KC · Centavos por libra (¢/lb)</div>
                </div>
                <span className="chart-tag coffee">Arabica · ICE</span>
              </div>
              <div className="chart-wrapper">
                <div className={`loading-overlay ${loadingCoffee ? '' : 'hidden'}`}>
                  <div className="spinner"></div>
                  <span className="loading-text">Carregando cotações...</span>
                </div>
                <div className={`error-msg ${errorCoffee ? 'show' : ''}`}>
                  <p>Não foi possível carregar os dados do café.</p>
                  <small>Verifique sua conexão ou tente um período menor.</small>
                </div>
                {coffeeConfig && <Line data={coffeeConfig.data} options={coffeeConfig.options as any} />}
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="chart-title dollar">💵 Dólar Americano — USD/BRL</div>
                  <div className="chart-meta">Banco Central do Brasil · PTAX · Reais por dólar</div>
                </div>
                <span className="chart-tag dollar">PTAX · BCB</span>
              </div>
              <div className="chart-wrapper">
                <div className={`loading-overlay ${loadingDollar ? '' : 'hidden'}`}>
                  <div className="spinner dollar-spin"></div>
                  <span className="loading-text">Carregando câmbio...</span>
                </div>
                <div className={`error-msg ${errorDollar ? 'show' : ''}`}>
                  <p>Não foi possível carregar os dados do dólar.</p>
                  <small>Verifique sua conexão ou tente um período menor.</small>
                </div>
                {dollarConfig && <Line data={dollarConfig.data} options={dollarConfig.options as any} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer>
        <p>Dados: <a href="https://finance.yahoo.com" target="_blank" rel="noreferrer">Yahoo Finance</a> (Café KC) · <a href="https://olinda.bcb.gov.br" target="_blank" rel="noreferrer">Banco Central do Brasil</a> (PTAX)</p>
        <p>Atualizado em: <span>{lastUpdate}</span></p>
      </footer>
    </>
  );
};

export default App;