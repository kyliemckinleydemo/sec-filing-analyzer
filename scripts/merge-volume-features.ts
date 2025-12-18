#!/usr/bin/env ts-node
/**
 * Merge Volume Features with Model Features
 *
 * Combines the baseline model features with pre-filing volume metrics
 * to create an enhanced feature set for model training.
 */

import * as fs from 'fs';
import * as path from 'path';

interface BaselineFeatures {
  filingId: string;
  ticker: string;
  filingDate: string;
  actual7dReturn: number;
  actual30dReturn: number | null;
  epsSurprise: number | null;
  epsActual: number | null;
  consensusEPS: number | null;
  epsBeat: boolean;
  epsMiss: boolean;
  epsInline: boolean;
  largeBeat: boolean;
  largeMiss: boolean;
  surpriseMagnitude: number;
  riskScore: number | null;
  sentimentScore: number | null;
  concernLevel: string | null;
  guidanceRaised: boolean;
  guidanceLowered: boolean;
}

interface VolumeFeatures {
  filingId: string;
  ticker: string;
  filingDate: string;
  actual7dReturn: number;
  epsSurprise: number | null;
  return_positive: boolean;
  beat: boolean;
  miss: boolean;
  avg_volume_30d_before: number;
  avg_volume_90d_baseline: number;
  abnormal_volume_ratio: number;
  volume_trend_30d_pct: number;
  max_spike_ratio: number;
  high_volume_days: number;
  volume_percentile: number;
  acceleration_ratio: number;
}

function parseCSV<T>(filePath: string): T[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: any = {};

    headers.forEach((header, i) => {
      const value = values[i];

      // Parse different types
      if (value === '' || value === 'null' || value === 'undefined') {
        obj[header] = null;
      } else if (value === 'true') {
        obj[header] = true;
      } else if (value === 'false') {
        obj[header] = false;
      } else if (!isNaN(Number(value))) {
        obj[header] = Number(value);
      } else {
        obj[header] = value;
      }
    });

    return obj as T;
  });
}

function writeCSV(filePath: string, data: any[]) {
  if (data.length === 0) {
    console.error('No data to write!');
    return;
  }

  // Get headers from first row
  const headers = Object.keys(data[0]);

  // Create CSV content
  const csvLines = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'boolean') return val.toString();
        return val.toString();
      }).join(',')
    )
  ];

  fs.writeFileSync(filePath, csvLines.join('\n'));
}

function main() {
  console.log('================================================================================');
  console.log('  MERGE VOLUME FEATURES');
  console.log('================================================================================\n');

  // Load baseline features
  console.log('📊 Loading baseline features from model-features-initial.csv...');
  const baselineFeatures = parseCSV<BaselineFeatures>('model-features-initial.csv');
  console.log(`  ✅ Loaded ${baselineFeatures.length} baseline samples\n`);

  // Load volume features
  console.log('📊 Loading volume features from prefiling-volume-data.csv...');
  const volumeFeatures = parseCSV<VolumeFeatures>('prefiling-volume-data.csv');
  console.log(`  ✅ Loaded ${volumeFeatures.length} volume samples\n`);

  // Create volume lookup by filingId
  const volumeMap = new Map<string, VolumeFeatures>();
  volumeFeatures.forEach(v => {
    volumeMap.set(v.filingId, v);
  });

  // Merge features
  console.log('🔗 Merging features...\n');

  const mergedFeatures = baselineFeatures.map(baseline => {
    const volume = volumeMap.get(baseline.filingId);

    if (!volume) {
      // No volume data - add null placeholders
      return {
        ...baseline,
        avg_volume_30d_before: null,
        avg_volume_90d_baseline: null,
        abnormal_volume_ratio: null,
        volume_trend_30d_pct: null,
        max_spike_ratio: null,
        high_volume_days: null,
        volume_percentile: null,
        acceleration_ratio: null,
        low_volume: false,
        high_volume: false,
        rising_volume: false,
        suspicious_pattern: false,
      };
    }

    // Calculate derived features
    const low_volume = volume.abnormal_volume_ratio < 0.8;
    const high_volume = volume.abnormal_volume_ratio > 1.3;
    const rising_volume = volume.volume_trend_30d_pct > 5;
    const suspicious_pattern = (
      volume.abnormal_volume_ratio > 1.5 &&
      volume.volume_trend_30d_pct > 15 &&
      volume.acceleration_ratio > 1.3
    );

    return {
      ...baseline,
      avg_volume_30d_before: volume.avg_volume_30d_before,
      avg_volume_90d_baseline: volume.avg_volume_90d_baseline,
      abnormal_volume_ratio: volume.abnormal_volume_ratio,
      volume_trend_30d_pct: volume.volume_trend_30d_pct,
      max_spike_ratio: volume.max_spike_ratio,
      high_volume_days: volume.high_volume_days,
      volume_percentile: volume.volume_percentile,
      acceleration_ratio: volume.acceleration_ratio,
      low_volume,
      high_volume,
      rising_volume,
      suspicious_pattern,
    };
  });

  // Calculate coverage stats
  const withVolume = mergedFeatures.filter(f => f.abnormal_volume_ratio !== null).length;
  const coverage = (withVolume / mergedFeatures.length * 100);

  console.log('📊 Feature Coverage:\n');
  console.log(`   Total samples:      ${mergedFeatures.length}`);
  console.log(`   With volume data:   ${withVolume} (${coverage.toFixed(1)}%)`);
  console.log(`   Without volume:     ${mergedFeatures.length - withVolume}\n`);

  // Feature summary
  const featuresWithVolume = mergedFeatures.filter(f => f.abnormal_volume_ratio !== null);
  const lowVolumeCount = featuresWithVolume.filter(f => f.low_volume).length;
  const highVolumeCount = featuresWithVolume.filter(f => f.high_volume).length;
  const risingVolumeCount = featuresWithVolume.filter(f => f.rising_volume).length;
  const suspiciousCount = featuresWithVolume.filter(f => f.suspicious_pattern).length;

  console.log('📊 Volume Feature Distribution:\n');
  console.log(`   Low volume (<0.8x):           ${lowVolumeCount} (${(lowVolumeCount/withVolume*100).toFixed(1)}%)`);
  console.log(`   High volume (>1.3x):          ${highVolumeCount} (${(highVolumeCount/withVolume*100).toFixed(1)}%)`);
  console.log(`   Rising volume (>5% trend):    ${risingVolumeCount} (${(risingVolumeCount/withVolume*100).toFixed(1)}%)`);
  console.log(`   Suspicious patterns:          ${suspiciousCount} (${(suspiciousCount/withVolume*100).toFixed(1)}%)\n`);

  // Save merged features
  const outputFile = 'model-features-with-volume.csv';
  console.log(`💾 Saving merged features to ${outputFile}...\n`);
  writeCSV(outputFile, mergedFeatures);

  console.log('✅ Done!\n');
  console.log('================================================================================');
  console.log('NEXT STEPS');
  console.log('================================================================================\n');
  console.log('Train the volume-enhanced model:');
  console.log('  python3 scripts/python/train-with-volume.py model-features-with-volume.csv\n');
}

main();
