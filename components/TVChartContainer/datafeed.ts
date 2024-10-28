import { Bar, DatafeedErrorCallback, HistoryCallback, LibrarySymbolInfo, OnReadyCallback, PeriodParams, ResolutionString, ResolveCallback, SearchSymbolsCallback, SubscribeBarsCallback, Timezone } from "@/public/static/charting_library/datafeed-api";
import { PeriodParamsWithOptionalCountback } from "@/public/static/datafeeds/udf/src/history-provider";

const configurationData = {
  supported_resolutions: [ '5', '10', '30', '60', '240', 'D'] as ResolutionString[]
};

type CatList = Record<string, number>

const getChainIdByNetwork: CatList  = {
  'eth': 1,
  'bsc': 56,
  'canto': 7700,
  'base': 8453,
  'graphlinq': 614,
  'avalance': 43114,
  'arbitrum': 42161,
  'polygon': 137
}


export const datafeed = {
  onReady: (callback: OnReadyCallback) => {
    console.log('[onReady]: Method call');
    setTimeout(() => callback(configurationData));
  },

  searchSymbols: async (userInput: string, exchange: string, symbolType: string, onResultReadyCallback: SearchSymbolsCallback )=> {
    console.log('[searchSymbols]: Method call');
    const url = `https://api.dex.guru/v1/tradingview/search?query=${userInput.toUpperCase()}&limit=30&type=${symbolType}&exchange=${exchange}`
    const response = await fetch(url)
    const symbolItems = await response.json()
    onResultReadyCallback(symbolItems);
  },

  resolveSymbol: async (symbolName: string, onSymbolResolvedCallback: ResolveCallback, onResolveErrorCallback: DatafeedErrorCallback ) => {
    console.log('[resolveSymbol]: Method call', symbolName);
    const url = `https://api.dex.guru/v1/tradingview/search?query=${symbolName}`

    const response = await fetch(url)
    const symbols = await response.json()
    const symbolItem = symbols.find((symbol: { ticker: any; }) => symbol.ticker === symbolName);

    if (!symbolItem) {
      onResolveErrorCallback('Cannot resolve symbol');
      return;
    }

    const symbolInfo = {
      ticker: symbolItem.ticker,
      name: symbolItem.symbol,
      description: symbolItem.description,
      type: symbolItem.type,
      session: '24x7',
      timezone: 'Etc/UTC' as Timezone,
      exchange: symbolItem.exchange,
      minmov: 1,
      pricescale: 100,
      has_intraday: true,
      supported_resolutions: configurationData.supported_resolutions,
    } as any;
    onSymbolResolvedCallback(symbolInfo);
  },

  getBars: async (symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, periodParams: PeriodParams, onHistoryCallback: HistoryCallback, onErrorCallback: DatafeedErrorCallback ) => {
    console.log('[getBars]: Method call', symbolInfo);
    const { from, firstDataRequest, countBack } = periodParams;
    try {
        const to = new Date().getTime() < 1000 * periodParams.to ? Math.floor(new Date().getTime()/ 1000) : periodParams.to
        const url = `https://api.dex.guru/v1/tradingview/history?symbol=${symbolInfo.ticker}&resolution=${resolution}&from=${from}&to=${to}`
        const fetchResponse = await fetch(url)
        const response = await fetchResponse.json()

        let bars: Bar[] = []


        if (!response || response.s !== 'ok') {
          // meta.noData = true
          // meta.nextTime = response?.nextTime
        } else {
          const ohlPresent = response.o !== undefined
          const volumePresent = response.v !== undefined

          for (let i = 0; i < response.t.length; ++i) {
            const barValue : Bar = {
              time: 1000 * response.t[i],
              close: parseFloat(response.c[i]),
              open: parseFloat(response.c[i]),
              high: parseFloat(response.c[i]),
              low: parseFloat(response.c[i]),

            }

            if (ohlPresent) {
              barValue.open = parseFloat(response.o[i])
              barValue.high = parseFloat(response.h[i])
              barValue.low = parseFloat(response.l[i])
            }
              bars = [...bars, barValue]
          }
        } 
        onHistoryCallback(bars, { noData: false });
    } catch (error) {
        onErrorCallback('');
    }
  }, 

  subscribeBars: (symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, onTick: SubscribeBarsCallback, listenerGuid: string) => {
    console.log('[subscribeBars]: Method call with subscriberUID:', listenerGuid);

    const ws = new WebSocket('wss://ws.dex.guru/v1/ws/channels')

    const interval = parseInt(resolution, 10) * 60

    if(!symbolInfo?.ticker){
      return
    }

    const [ tokenAddress, rest ] = symbolInfo?.ticker?.split('-')
    const [ network ] = rest.split('_')
    const chainId = getChainIdByNetwork[network]

    const currency = 'S'
    const id = `RoundedCandle.id-${currency}-${interval}-${chainId}-all-${tokenAddress}`

    ws.onopen = () => ws.send(JSON.stringify({
      type: 'subscribe',
      data:{
        channel_id: id,
        params:{
          subscriber_id: id
        }
      }
    }));

    ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data)

      if( type === 'updated' ){
        const bar = {
          time: data.update.t_rounded * 1000,
          high: data.update.h,
          low: data.update.l,
          open: data.update.o,
          close: data.update.c,
          volume: data.update.v,
        }
        bar && onTick(bar)
      }
    };
  },

  unsubscribeBars: (listenerGuid: string) => {
    console.log('[unsubscribeBars]: Method call with subscriberUID:', listenerGuid);
  },
}
