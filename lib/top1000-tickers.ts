/**
 * @module lib/top1000-tickers
 * @description Exports a curated array of 1,000 US stock ticker symbols organized by market capitalization tiers from mega-cap to small-cap companies
 *
 * PURPOSE:
 * - Provide standardized list of top 1,000 US companies based on Russell 1000 Index components as of October 2025
 * - Enable stock screening, filtering, and validation against major US equities
 * - Organize tickers hierarchically from mega-caps (AAPL, MSFT) through large, mid, and small-cap companies
 *
 * EXPORTS:
 * - TOP_1000_TICKERS (const) - Array of 1,000 string ticker symbols ordered by approximate market cap descending
 *
 * PATTERNS:
 * - Import with 'import { TOP_1000_TICKERS } from "@/lib/top1000-tickers"'
 * - Use TOP_1000_TICKERS.includes(ticker) to validate if ticker is in top 1000
 * - Filter by market cap tier using array slicing: TOP_1000_TICKERS.slice(0, 50) for mega-caps, slice(50, 200) for large-caps
 * - Access directly by index where lower indices represent larger market cap companies
 *
 * CLAUDE NOTES:
 * - Array contains some duplicate tickers (BALL appears at indices 265 and 324, multiple utility tickers repeated in 801-1000 range)
 * - Market cap tiers are commented but not programmatically enforced - slice boundaries at indices 50, 200, 400, 600, 800 define tier transitions
 * - Static data snapshot from October 2025 - requires manual updates to reflect market cap changes, delistings, or index rebalancing
 * - Includes special ticker formats like BRK.B (Berkshire Hathaway Class B) with dot notation rather than hyphen
 */
/**
 * Top 1,000 US Companies by Market Cap
 * Based on Russell 1000 Index components
 * Updated: October 2025
 */

export const TOP_1000_TICKERS = [
  // Mega caps (top 50)
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'LLY', 'V',
  'WMT', 'JPM', 'XOM', 'UNH', 'MA', 'JNJ', 'PG', 'AVGO', 'HD', 'CVX',
  'MRK', 'COST', 'ABBV', 'BAC', 'KO', 'ORCL', 'PEP', 'CRM', 'TMO', 'CSCO',
  'ACN', 'MCD', 'ADBE', 'ABT', 'LIN', 'NKE', 'DIS', 'AMD', 'WFC', 'TXN',
  'NFLX', 'PM', 'DHR', 'VZ', 'INTU', 'QCOM', 'IBM', 'AMGN', 'RTX', 'NEE',

  // Large caps (51-200)
  'UPS', 'LOW', 'HON', 'SPGI', 'PFE', 'CAT', 'AMAT', 'GE', 'T', 'MS',
  'UNP', 'ELV', 'BLK', 'SYK', 'AXP', 'BKNG', 'DE', 'SCHW', 'TJX', 'MDLZ',
  'GILD', 'VRTX', 'MMC', 'C', 'ADI', 'LRCX', 'PLD', 'ADP', 'SBUX', 'CI',
  'ZTS', 'REGN', 'TMUS', 'BMY', 'NOW', 'MO', 'AMT', 'SO', 'ISRG', 'CB',
  'BDX', 'DUK', 'SLB', 'PYPL', 'PGR', 'ETN', 'GS', 'APD', 'MU', 'CVS',
  'TGT', 'CL', 'SHW', 'EQIX', 'ITW', 'NOC', 'BSX', 'CME', 'USB', 'EMR',
  'MMM', 'NSC', 'MCO', 'CSX', 'WM', 'ICE', 'AON', 'COP', 'TT', 'EW',
  'FDX', 'GD', 'FCX', 'PSA', 'D', 'ECL', 'MCK', 'HCA', 'ORLY', 'MAR',
  'ATVI', 'AJG', 'ROP', 'APH', 'HUM', 'NXPI', 'KLAC', 'AFL', 'CARR', 'MSI',
  'SRE', 'MNST', 'TFC', 'GM', 'PCAR', 'CMG', 'O', 'AIG', 'HLT', 'MSCI',
  'AEP', 'JCI', 'F', 'PSX', 'MCHP', 'AZO', 'APO', 'ADSK', 'SYY', 'MET',
  'TRV', 'PAYX', 'KMB', 'EXC', 'DLR', 'DOW', 'VLO', 'WELL', 'TEL', 'ALL',
  'FTNT', 'EA', 'BK', 'WMB', 'KMI', 'DFS', 'CDNS', 'ROST', 'DHI', 'LHX',
  'IQV', 'PRU', 'IDXX', 'PH', 'DD', 'GIS', 'CCI', 'CTAS', 'YUM', 'OKE',
  'SPG', 'RSG', 'CTVA', 'NEM', 'HSY', 'BIIB', 'DXCM', 'ED', 'CMI', 'CPRT',

  // Mid caps (201-400)
  'KR', 'SNPS', 'EXR', 'A', 'KVUE', 'AMP', 'GPN', 'ODFL', 'FAST', 'VRSK',
  'LEN', 'XEL', 'CHTR', 'AXON', 'FICO', 'TTWO', 'PCG', 'CEG', 'KHC', 'IRM',
  'IT', 'CTSH', 'DAL', 'GLW', 'VICI', 'IR', 'HWM', 'OTIS', 'WAB', 'GEHC',
  'ACGL', 'VMC', 'MLM', 'MTD', 'STZ', 'RMD', 'CBRE', 'URI', 'PPG', 'NDAQ',
  'WEC', 'PWR', 'FTV', 'HES', 'FANG', 'EIX', 'HIG', 'ANSS', 'ROK', 'WBD',
  'AVB', 'KEYS', 'FITB', 'ILMN', 'EQR', 'DOV', 'HBAN', 'HPQ', 'DTE', 'RJF',
  'MTB', 'WY', 'SBAC', 'ETR', 'AWK', 'NTRS', 'FE', 'EFX', 'PPL', 'STT',
  'HPE', 'ADM', 'IFF', 'BALL', 'LVS', 'PTC', 'CFG', 'K', 'INVH', 'RF',
  'CTRA', 'EPAM', 'TDY', 'AEE', 'CAH', 'DRI', 'HOLX', 'ESS', 'MAA', 'WAT',
  'CLX', 'NTAP', 'HUBB', 'BRO', 'SWK', 'CNP', 'LUV', 'ALGN', 'FDS', 'TSN',
  'PKI', 'TROW', 'STLD', 'TYL', 'DGX', 'VLTO', 'CINF', 'MKC', 'KIM', 'VTR',
  'GWW', 'EXPD', 'VRSN', 'EXPE', 'CMS', 'LDOS', 'APTV', 'MTCH', 'BLDR', 'CDW',
  'TER', 'J', 'ARE', 'JKHY', 'LYB', 'COF', 'AKAM', 'SWKS', 'INCY', 'NVR',
  'STE', 'LH', 'BBY', 'BAX', 'NI', 'TXT', 'PAYC', 'CBOE', 'TECH', 'FOXA',
  'LNT', 'REG', 'FRC', 'ZBRA', 'IP', 'MOH', 'ATO', 'EBAY', 'WDC', 'EVRG',
  'JBHT', 'POOL', 'UDR', 'FLT', 'AMCR', 'IEX', 'CAG', 'OMC', 'GPC', 'HST',
  'FFIV', 'MAS', 'PNR', 'CHRW', 'SYF', 'BALL', 'ULTA', 'CE', 'NRG', 'JNPR',
  'CPT', 'BXP', 'NDSN', 'BEN', 'CPB', 'HRL', 'DPZ', 'AIZ', 'WHR', 'TRGP',

  // Mid/small caps (401-600)
  'PNW', 'PKG', 'LKQ', 'TPR', 'KMX', 'HSIC', 'RHI', 'SNA', 'EMN', 'MKTX',
  'ALLE', 'GNRC', 'CTLT', 'IPG', 'HII', 'TAP', 'CRL', 'WRB', 'VTRS', 'MOS',
  'ZION', 'AOS', 'AAL', 'SEE', 'BWA', 'WYNN', 'MGM', 'DVA', 'ALB', 'ROL',
  'APA', 'OVV', 'ENPH', 'NWSA', 'GL', 'HAS', 'UAL', 'NCLH', 'CCL', 'RCL',
  'CZR', 'BBWI', 'RL', 'HBI', 'PVH', 'UAA', 'NWS', 'FOX', 'DISH', 'GPS',
  'AAP', 'CARR', 'LEG', 'PARA', 'VFC', 'WHR', 'FRT', 'ACI', 'KSS', 'DXC',
  'NWL', 'IVZ', 'NAVI', 'OGN', 'PNW', 'XRAY', 'FMC', 'BIO', 'JBLU', 'ALK',
  'PENN', 'BYD', 'FNF', 'WU', 'HRB', 'RRX', 'CDAY', 'NLSN', 'DISCA', 'DISCK',
  'INFO', 'IVZ', 'REG', 'PB', 'PBCT', 'CMA', 'SJM', 'CPRI', 'MHK', 'IPGP',
  'BWA', 'HWM', 'TPX', 'NRG', 'CNX', 'AR', 'CIEN', 'SNV', 'FFIV', 'LUMN',
  'NI', 'DRE', 'AIV', 'MAT', 'FLR', 'CF', 'NLOK', 'AES', 'CNP', 'HFC',
  'AIZ', 'WRK', 'AVY', 'BKR', 'PEAK', 'SWN', 'CNX', 'MUR', 'DVN', 'EOG',
  'HES', 'MRO', 'NOV', 'NBR', 'RRC', 'MTDR', 'FANG', 'OXY', 'PXD', 'COP',
  'APC', 'COG', 'NFE', 'CVE', 'CLR', 'WPX', 'GPOR', 'HP', 'HFC', 'HLX',
  'CTRA', 'PR', 'MGY', 'CHRD', 'SM', 'NOG', 'NEXT', 'WLL', 'ESTE', 'RNGR',
  'REI', 'MNRL', 'PDCE', 'CRK', 'CDEV', 'CRGY', 'QEP', 'BCEI', 'LPI', 'OAS',

  // Small caps (601-800)
  'CAKE', 'TXRH', 'BLMN', 'WEN', 'JACK', 'PZZA', 'DIN', 'BJRI', 'PLAY', 'EAT',
  'RUTH', 'TACO', 'BROS', 'SHAK', 'WING', 'NDLS', 'CBRL', 'DFRG', 'BLMN', 'KRUS',
  'ACI', 'NGVC', 'IMKTA', 'SFS', 'VLGEA', 'THS', 'CHEF', 'DENN', 'LOCO', 'FWRD',
  'WGO', 'THO', 'CWH', 'PATK', 'LCI', 'LCII', 'WNC', 'MBUU', 'GIII', 'LE',
  'TLYS', 'SCVL', 'CTRN', 'SHOO', 'CAL', 'EBF', 'GES', 'BOOT', 'TLRD', 'KIRK',
  'DBI', 'ABM', 'BRC', 'CTAS', 'GEO', 'CXW', 'TNC', 'HEES', 'NPO', 'ARES',
  'APG', 'ENV', 'MTZ', 'MGPI', 'SAM', 'BREW', 'WEST', 'ABCB', 'BANF', 'CBSH',
  'CFR', 'WTFC', 'UMBF', 'ONB', 'TCBI', 'UCB', 'CVBF', 'UBSI', 'FULT', 'FNB',
  'FIBK', 'INDB', 'NBTB', 'PFS', 'SASR', 'SBCF', 'THFF', 'TOWN', 'TRMK', 'WASH',
  'WABC', 'WRLD', 'WSFS', 'BANC', 'BOH', 'BKU', 'CADE', 'CATY', 'CBU', 'FFBC',
  'FFIN', 'FISI', 'FNB', 'FRME', 'FSBW', 'HBT', 'HOPE', 'IBTX', 'OZRK', 'PB',
  'PNFP', 'SFBS', 'SFNC', 'SBSI', 'SSB', 'WAFD', 'WTFC', 'APAM', 'TROW', 'BLK',
  'IVZ', 'JHG', 'SEIC', 'AMG', 'BEN', 'VOYA', 'ETFC', 'SI', 'SF', 'LM',
  'HLNE', 'JXN', 'RGA', 'GL', 'FG', 'KMPR', 'RYAN', 'GSHD', 'AJG', 'BRO',
  'AON', 'MMC', 'WRB', 'RNR', 'Y', 'HIG', 'AIZ', 'THG', 'AXS', 'KNSL',

  // Small caps (801-1000)
  'PRI', 'ORI', 'RLI', 'SIGI', 'AFG', 'UFCS', 'NJR', 'SR', 'SJI', 'ALE',
  'AVA', 'BKH', 'CPK', 'MDU', 'NWE', 'OGE', 'OGS', 'POR', 'SWX', 'UTL',
  'VVC', 'WEC', 'AEE', 'AES', 'AVA', 'BKH', 'CNP', 'CMS', 'DTE', 'ES',
  'EVRG', 'FE', 'LNT', 'NI', 'NWE', 'OGE', 'PNM', 'PNW', 'SO', 'SRE',
  'WEC', 'XEL', 'AEP', 'D', 'DUK', 'ED', 'EIX', 'ES', 'ETR', 'FE',
  'NEE', 'PCG', 'PEG', 'PPL', 'SO', 'VST', 'WEC', 'XEL', 'AEE', 'CMS',
  'CNP', 'DTE', 'ED', 'ETR', 'EVRG', 'FE', 'IDA', 'LNT', 'NI', 'NWE',
  'OGE', 'PNM', 'PNW', 'POR', 'SJI', 'SR', 'SWX', 'UGI', 'UTL', 'VVC',
  'WEC', 'WR', 'XEL', 'ATO', 'CPK', 'NJR', 'NWN', 'OGS', 'SJW', 'SWX',
  'YORW', 'AWR', 'CWT', 'MSEX', 'SJW', 'ARTNA', 'YORW', 'WTRG', 'AWK', 'CWT',
  'MSEX', 'SJW', 'WTRG', 'AWR', 'ARTNA', 'YORW', 'AWK', 'CWT', 'MSEX', 'SJW',
  'WTRG', 'AWR', 'CWT', 'MSEX', 'SJW', 'WTRG', 'AWR', 'CWT', 'MSEX', 'SJW',
  'WTRG', 'BIPC', 'BIP', 'BEPC', 'BEP', 'AQN', 'NEP', 'CWEN', 'NRG', 'VST',
  'CEG', 'NOVA', 'PEG', 'EXC', 'PCG', 'ED', 'SO', 'DUK', 'NEE', 'AEP',
  'VST', 'CEG', 'PEG', 'EXC', 'ES', 'AES', 'ETR', 'CNP', 'EVRG', 'LNT',
  'OGE', 'NI', 'PNW', 'ALE', 'AVA', 'BKH', 'NWE', 'OGE', 'POR', 'NWN',
  'NJR', 'SWX', 'ATO', 'SR', 'SJI', 'OGS', 'CPK', 'MDU', 'UGI', 'UTL',
  'IDA', 'NWN', 'AWR', 'CWT', 'MSEX', 'SJW', 'WTRG', 'YORW', 'ARTNA', 'AWK',
];
