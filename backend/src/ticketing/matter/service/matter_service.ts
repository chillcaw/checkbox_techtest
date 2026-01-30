import { MatterRepo } from '../repo/matter_repo.js';
import { CycleTimeService } from './cycle_time_service.js';
import { Matter, MatterListParams, MatterListResponse, StatusValue, CurrencyValue, UserValue } from '../../types.js';

export class MatterService {
  private matterRepo: MatterRepo;
  private cycleTimeService: CycleTimeService;

  constructor() {
    this.matterRepo = new MatterRepo();
    this.cycleTimeService = new CycleTimeService();
  }

  async getMatters(params: MatterListParams): Promise<MatterListResponse> {
    const { page = 1, limit = 25 } = params;
    const { matters, total } = await this.matterRepo.getMatters(params);

    // Calculate cycle time and SLA for each matter
    const enrichedMatters = await Promise.all(
      matters.map(async (matter) => {
        // Get current status group name
        const statusField = matter.fields['Status'];
        let statusGroupName: string | null = null;
        
        if (statusField && statusField.value && typeof statusField.value === 'object') {
          statusGroupName = (statusField.value as StatusValue).groupName || null;
        }

        const { cycleTime, sla } = await this.cycleTimeService.calculateCycleTimeAndSLA(
          matter.id,
          statusGroupName,
        );

        return {
          ...matter,
          cycleTime,
          sla,
        };
      }),
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data: enrichedMatters,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getMatterById(matterId: string): Promise<Matter | null> {
    const matter = await this.matterRepo.getMatterById(matterId);
    
    if (!matter) {
      return null;
    }

    // Calculate cycle time and SLA
    const statusField = matter.fields['Status'];
    let statusGroupName: string | null = null;
    
    if (statusField && statusField.value && typeof statusField.value === 'object') {
      statusGroupName = (statusField.value as StatusValue).groupName || null;
    }

    const { cycleTime, sla } = await this.cycleTimeService.calculateCycleTimeAndSLA(
      matter.id,
      statusGroupName,
    );

    return {
      ...matter,
      cycleTime,
      sla,
    };
  }

  async updateMatter(
    matterId: string,
    fieldId: string,
    fieldType: string,
    value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null,
    userId: number,
  ): Promise<void> {
    await this.matterRepo.updateMatterField(matterId, fieldId, fieldType, value, userId);
  }
}

export default MatterService;

