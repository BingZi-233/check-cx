import { createClient } from "@/lib/supabase/server";
import type { GroupInfoRow } from "@/lib/types/database";

/**
 * 加载所有分组信息
 */
export async function loadGroupInfos(): Promise<GroupInfoRow[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('group_info')
    .select('*');
    
  if (error) {
    console.error("Failed to load group info:", error);
    return [];
  }
  
  return data as GroupInfoRow[];
}

/**
 * 获取指定分组的信息
 */
export async function getGroupInfo(groupName: string): Promise<GroupInfoRow | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('group_info')
    .select('*')
    .eq('group_name', groupName)
    .single();
    
  if (error) {
    // 如果没找到或出错，返回 null，不阻塞主流程
    if (error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error(`Failed to load group info for ${groupName}:`, error);
    }
    return null;
  }
  
  return data as GroupInfoRow;
}
