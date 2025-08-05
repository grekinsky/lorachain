import { type DutyCycleConfig, type FrequencyBandConfig } from './types.js';

/**
 * Regional Configuration Presets for Duty Cycle Management
 *
 * Provides pre-configured duty cycle settings for major regulatory regions:
 * - EU (ETSI) with sub-band duty cycles
 * - US/CA/MX (FCC/IC) with frequency hopping
 * - Japan (ARIB) with 10% duty cycle
 * - Australia/NZ (ACMA) with power limits only
 * - Other regions with custom configurations
 */

// EU868 frequency band configuration with sub-band duty cycles
const EU868_BAND: FrequencyBandConfig = {
  name: 'EU868',
  centerFrequencyMHz: 868.1,
  bandwidthMHz: 7,
  minFrequencyMHz: 863,
  maxFrequencyMHz: 870,
  subBands: [
    // 863-865 MHz: 0.1% duty cycle
    { minMHz: 863, maxMHz: 865, dutyCyclePercent: 0.001, maxEIRP_dBm: 14 },
    // 865-868 MHz: 1% duty cycle
    { minMHz: 865, maxMHz: 868, dutyCyclePercent: 0.01, maxEIRP_dBm: 14 },
    // 868-868.6 MHz: 1% duty cycle
    { minMHz: 868, maxMHz: 868.6, dutyCyclePercent: 0.01, maxEIRP_dBm: 14 },
    // 868.7-869.2 MHz: 0.1% duty cycle
    { minMHz: 868.7, maxMHz: 869.2, dutyCyclePercent: 0.001, maxEIRP_dBm: 14 },
    // 869.4-869.65 MHz: 10% duty cycle
    { minMHz: 869.4, maxMHz: 869.65, dutyCyclePercent: 0.1, maxEIRP_dBm: 27 },
    // 869.7-870 MHz: 1% duty cycle
    { minMHz: 869.7, maxMHz: 870, dutyCyclePercent: 0.01, maxEIRP_dBm: 14 },
  ],
  channels: [
    { number: 0, frequencyMHz: 868.1, dataRate: 'SF12BW125', enabled: true },
    { number: 1, frequencyMHz: 868.3, dataRate: 'SF12BW125', enabled: true },
    { number: 2, frequencyMHz: 868.5, dataRate: 'SF12BW125', enabled: true },
    { number: 3, frequencyMHz: 867.1, dataRate: 'SF12BW125', enabled: true },
    { number: 4, frequencyMHz: 867.3, dataRate: 'SF12BW125', enabled: true },
    { number: 5, frequencyMHz: 867.5, dataRate: 'SF12BW125', enabled: true },
    { number: 6, frequencyMHz: 867.7, dataRate: 'SF12BW125', enabled: true },
    { number: 7, frequencyMHz: 867.9, dataRate: 'SF12BW125', enabled: true },
  ],
};

// EU433 frequency band configuration
const EU433_BAND: FrequencyBandConfig = {
  name: 'EU433',
  centerFrequencyMHz: 433.92,
  bandwidthMHz: 1.74,
  minFrequencyMHz: 433.05,
  maxFrequencyMHz: 434.79,
  channels: [
    { number: 0, frequencyMHz: 433.175, dataRate: 'SF12BW125', enabled: true },
    { number: 1, frequencyMHz: 433.375, dataRate: 'SF12BW125', enabled: true },
    { number: 2, frequencyMHz: 433.575, dataRate: 'SF12BW125', enabled: true },
  ],
};

// US915 frequency band configuration
const US915_BAND: FrequencyBandConfig = {
  name: 'US915',
  centerFrequencyMHz: 915,
  bandwidthMHz: 26,
  minFrequencyMHz: 902,
  maxFrequencyMHz: 928,
  channels: Array.from({ length: 64 }, (_, i) => ({
    number: i,
    frequencyMHz: 902.3 + i * 0.2,
    dataRate: 'SF7BW125',
    enabled: true,
  })),
};

// AU915 frequency band configuration
const AU915_BAND: FrequencyBandConfig = {
  name: 'AU915',
  centerFrequencyMHz: 915,
  bandwidthMHz: 13,
  minFrequencyMHz: 915,
  maxFrequencyMHz: 928,
  channels: Array.from({ length: 64 }, (_, i) => ({
    number: i,
    frequencyMHz: 915.2 + i * 0.2,
    dataRate: 'SF7BW125',
    enabled: true,
  })),
};

// JP920 frequency band configuration
const JP920_BAND: FrequencyBandConfig = {
  name: 'JP920',
  centerFrequencyMHz: 921.8,
  bandwidthMHz: 3,
  minFrequencyMHz: 920,
  maxFrequencyMHz: 923,
  channels: Array.from({ length: 10 }, (_, i) => ({
    number: i,
    frequencyMHz: 920.6 + i * 0.2,
    dataRate: 'SF7BW125',
    enabled: true,
  })),
};

/**
 * Regional configuration presets
 */
export const REGIONAL_PRESETS: Record<string, Partial<DutyCycleConfig>> = {
  EU: {
    region: 'EU',
    regulatoryBody: 'ETSI',
    frequencyBands: [EU433_BAND, EU868_BAND],
    activeFrequencyBand: 'EU868',
    maxDutyCyclePercent: 0.01, // 1% default, overridden by sub-bands
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 1000,
    maxEIRP_dBm: 14,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: false,
    strictComplianceMode: true,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  US: {
    region: 'US',
    regulatoryBody: 'FCC',
    frequencyBands: [US915_BAND],
    activeFrequencyBand: 'US915',
    maxDutyCyclePercent: undefined, // No duty cycle limit
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 10000,
    dwellTimeMs: 400,
    frequencyHopping: {
      enabled: true,
      numChannels: 64,
      channelDwellTimeMs: 400,
      hopPattern: 'random',
    },
    maxEIRP_dBm: 30, // 1W for frequency hopping
    adaptivePowerControl: true,
    emergencyOverrideEnabled: true,
    strictComplianceMode: true,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  CA: {
    region: 'CA',
    regulatoryBody: 'IC',
    frequencyBands: [US915_BAND], // Canada follows US band plan
    activeFrequencyBand: 'US915',
    maxDutyCyclePercent: undefined, // No duty cycle limit
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 10000,
    dwellTimeMs: 400,
    frequencyHopping: {
      enabled: true,
      numChannels: 64,
      channelDwellTimeMs: 400,
      hopPattern: 'random',
    },
    maxEIRP_dBm: 30,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: true,
    strictComplianceMode: true,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  MX: {
    region: 'MX',
    regulatoryBody: 'FCC', // Mexico follows FCC rules
    frequencyBands: [US915_BAND],
    activeFrequencyBand: 'US915',
    maxDutyCyclePercent: undefined, // No duty cycle limit
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 10000,
    dwellTimeMs: 400,
    frequencyHopping: {
      enabled: true,
      numChannels: 64,
      channelDwellTimeMs: 400,
      hopPattern: 'random',
    },
    maxEIRP_dBm: 30,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: true,
    strictComplianceMode: true,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  JP: {
    region: 'JP',
    regulatoryBody: 'ARIB',
    frequencyBands: [JP920_BAND],
    activeFrequencyBand: 'JP920',
    maxDutyCyclePercent: 0.1, // 10% duty cycle
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 4000,
    maxEIRP_dBm: 14,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: false,
    strictComplianceMode: true,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  AU: {
    region: 'AU',
    regulatoryBody: 'ACMA',
    frequencyBands: [AU915_BAND],
    activeFrequencyBand: 'AU915',
    maxDutyCyclePercent: undefined, // No duty cycle limit
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 10000,
    maxEIRP_dBm: 30,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: true,
    strictComplianceMode: false, // More relaxed than EU/JP
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  NZ: {
    region: 'NZ',
    regulatoryBody: 'ACMA', // New Zealand follows similar rules to Australia
    frequencyBands: [AU915_BAND],
    activeFrequencyBand: 'AU915',
    maxDutyCyclePercent: undefined, // No duty cycle limit
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 10000,
    maxEIRP_dBm: 30,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: true,
    strictComplianceMode: false,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  BR: {
    region: 'BR',
    regulatoryBody: 'ANATEL',
    frequencyBands: [US915_BAND], // Brazil uses 915MHz band
    activeFrequencyBand: 'US915',
    maxDutyCyclePercent: undefined, // No duty cycle limit
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 10000,
    maxEIRP_dBm: 30,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: true,
    strictComplianceMode: false,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  AR: {
    region: 'AR',
    regulatoryBody: 'FCC', // Argentina follows US FCC regulations
    frequencyBands: [US915_BAND],
    activeFrequencyBand: 'US915',
    maxDutyCyclePercent: undefined, // No duty cycle limit
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 10000,
    maxEIRP_dBm: 30,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: true,
    strictComplianceMode: false,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  IN: {
    region: 'IN',
    regulatoryBody: 'WPC',
    frequencyBands: [EU868_BAND], // India uses 865-867 MHz band (subset of EU868)
    activeFrequencyBand: 'EU868',
    maxDutyCyclePercent: undefined, // No specific duty cycle limit
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 5000,
    maxEIRP_dBm: 30,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: true,
    strictComplianceMode: false,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  RU: {
    region: 'RU',
    regulatoryBody: 'CUSTOM',
    frequencyBands: [EU868_BAND], // Russia uses subset of EU bands
    activeFrequencyBand: 'EU868',
    maxDutyCyclePercent: 0.001, // 0.1% duty cycle (very strict)
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 1000,
    maxEIRP_dBm: 14,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: false,
    strictComplianceMode: true,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  KR: {
    region: 'KR',
    regulatoryBody: 'KC',
    frequencyBands: [JP920_BAND], // South Korea uses similar band to Japan
    activeFrequencyBand: 'JP920',
    maxDutyCyclePercent: 0.05, // 5% duty cycle (varies by channel)
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 2000,
    maxEIRP_dBm: 14,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: false,
    strictComplianceMode: true,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  CN: {
    region: 'CN',
    regulatoryBody: 'SRRC',
    frequencyBands: [
      {
        name: 'CN470',
        centerFrequencyMHz: 490,
        bandwidthMHz: 40,
        minFrequencyMHz: 470,
        maxFrequencyMHz: 510,
        channels: Array.from({ length: 96 }, (_, i) => ({
          number: i,
          frequencyMHz: 470.3 + i * 0.2,
          dataRate: 'SF12BW125',
          enabled: true,
        })),
      },
    ],
    activeFrequencyBand: 'CN470',
    maxDutyCyclePercent: 0.01, // 1% duty cycle
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 2000,
    maxEIRP_dBm: 17, // Varies by region in China
    adaptivePowerControl: true,
    emergencyOverrideEnabled: false,
    strictComplianceMode: true,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },

  ZA: {
    region: 'ZA',
    regulatoryBody: 'CUSTOM',
    frequencyBands: [EU868_BAND], // South Africa follows EU regulations
    activeFrequencyBand: 'EU868',
    maxDutyCyclePercent: 0.01, // 1% duty cycle
    trackingWindowHours: 1,
    maxTransmissionTimeMs: 1000,
    maxEIRP_dBm: 14,
    adaptivePowerControl: true,
    emergencyOverrideEnabled: false,
    strictComplianceMode: true,
    autoRegionDetection: false,
    persistenceEnabled: true,
  },
};

/**
 * Default LoRa transmission parameters by region
 */
export const DEFAULT_LORA_PARAMS: Record<string, any> = {
  EU: {
    spreadingFactor: 12,
    bandwidth: 125,
    codingRate: 4 / 5,
    preambleLength: 8,
    headerMode: 'explicit',
    crcEnabled: true,
    lowDataRateOptimize: true,
  },
  US: {
    spreadingFactor: 7,
    bandwidth: 125,
    codingRate: 4 / 5,
    preambleLength: 8,
    headerMode: 'explicit',
    crcEnabled: true,
    lowDataRateOptimize: false,
  },
  JP: {
    spreadingFactor: 12,
    bandwidth: 125,
    codingRate: 4 / 5,
    preambleLength: 8,
    headerMode: 'explicit',
    crcEnabled: true,
    lowDataRateOptimize: true,
  },
  AU: {
    spreadingFactor: 7,
    bandwidth: 125,
    codingRate: 4 / 5,
    preambleLength: 8,
    headerMode: 'explicit',
    crcEnabled: true,
    lowDataRateOptimize: false,
  },
};

/**
 * DutyCycleConfigFactory - Factory for creating region-specific configurations
 */
export class DutyCycleConfigFactory {
  /**
   * Creates a duty cycle configuration for the specified region
   */
  static createForRegion(
    region: string,
    networkType: 'devnet' | 'testnet' | 'mainnet' = 'mainnet',
    overrides: Partial<DutyCycleConfig> = {}
  ): DutyCycleConfig {
    const preset = REGIONAL_PRESETS[region.toUpperCase()];
    if (!preset) {
      throw new Error(`No preset configuration for region: ${region}`);
    }

    return {
      ...preset,
      networkType,
      ...overrides,
    } as DutyCycleConfig;
  }

  /**
   * Lists all available regions
   */
  static getAvailableRegions(): string[] {
    return Object.keys(REGIONAL_PRESETS);
  }

  /**
   * Gets the regulatory body for a region
   */
  static getRegulatoryBody(region: string): string {
    const preset = REGIONAL_PRESETS[region.toUpperCase()];
    return preset?.regulatoryBody || 'CUSTOM';
  }

  /**
   * Checks if a region has duty cycle restrictions
   */
  static hasDomayCycleRestrictions(region: string): boolean {
    const preset = REGIONAL_PRESETS[region.toUpperCase()];
    return preset?.maxDutyCyclePercent !== undefined;
  }

  /**
   * Gets default LoRa parameters for a region
   */
  static getDefaultLoRaParams(region: string): any {
    return (
      DEFAULT_LORA_PARAMS[region.toUpperCase()] || DEFAULT_LORA_PARAMS['EU']
    );
  }

  /**
   * Creates a development/testing configuration with relaxed rules
   */
  static createDevConfig(region: string = 'EU'): DutyCycleConfig {
    const baseConfig = this.createForRegion(region, 'devnet');

    return {
      ...baseConfig,
      strictComplianceMode: false,
      emergencyOverrideEnabled: true,
      maxTransmissionTimeMs: 10000, // Allow longer transmissions for testing
      trackingWindowHours: 0.1, // Shorter window for faster testing
      maxDutyCyclePercent: baseConfig.maxDutyCyclePercent
        ? baseConfig.maxDutyCyclePercent * 5
        : undefined, // 5x more lenient
    };
  }

  /**
   * Validates a duty cycle configuration
   */
  static validateConfig(config: DutyCycleConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate required fields
    if (!config.region) errors.push('Region is required');
    if (!config.regulatoryBody) errors.push('Regulatory body is required');
    if (!config.frequencyBands || config.frequencyBands.length === 0) {
      errors.push('At least one frequency band is required');
    }
    if (!config.activeFrequencyBand)
      errors.push('Active frequency band is required');

    // Validate duty cycle settings
    if (config.maxDutyCyclePercent !== undefined) {
      if (config.maxDutyCyclePercent < 0 || config.maxDutyCyclePercent > 1) {
        errors.push('Duty cycle must be between 0 and 1 (0% to 100%)');
      }
    }

    // Validate timing constraints
    if (config.maxTransmissionTimeMs <= 0) {
      errors.push('Maximum transmission time must be positive');
    }
    if (config.trackingWindowHours <= 0) {
      errors.push('Tracking window must be positive');
    }

    // Validate power limits
    if (config.maxEIRP_dBm < -10 || config.maxEIRP_dBm > 50) {
      errors.push('EIRP must be between -10 and 50 dBm');
    }

    // Validate frequency hopping settings
    if (config.frequencyHopping?.enabled) {
      if (!config.dwellTimeMs || config.dwellTimeMs <= 0) {
        errors.push('Dwell time is required for frequency hopping');
      }
      if (config.frequencyHopping.numChannels < 1) {
        errors.push('Number of channels must be positive');
      }
      if (config.frequencyHopping.channelDwellTimeMs <= 0) {
        errors.push('Channel dwell time must be positive');
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
