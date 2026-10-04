export class Query {
  constructor(db,table){this.db=db;this.table=table;this.mode='select';this.conditions=[];this.params=[];this.columns='*';}
  select(columns='*'){this.columns=columns;return this;}
  insert(body){this.mode='insert';this.body=body;return this;}
  update(body){this.mode='update';this.body=body;return this;}
  delete(){this.mode='delete';return this;}
  eq(key,value){this.params.push(value);this.conditions.push(`"${key}"=$${this.params.length}`);return this;}
  in(key,values){this.params.push(values);this.conditions.push(`"${key}"=any($${this.params.length})`);return this;}
  order(key,{ascending}){this.orderBy=` order by "${key}" ${ascending?'asc':'desc'}`;return this;}
  limit(n){this.count=n;return this;}
  single(){this.one=true;return this;}
  maybeSingle(){this.one=true;return this;}
  async then(resolve,reject){
    try{
      let sql,params=[...this.params],where=this.conditions.length?' where '+this.conditions.join(' and '):'';
      if(this.mode==='select')sql=`select ${this.columns} from public.${this.table}${where}${this.orderBy||''}${this.count?' limit '+this.count:''}`;
      else if(this.mode==='delete')sql=`delete from public.${this.table}${where} returning ${this.columns}`;
      else {
        const fields=Object.keys(this.body),tokens=fields.map(key=>{params.push(this.body[key]);return '$'+params.length;});
        if(this.mode==='insert')sql=`insert into public.${this.table}(${fields.join(',')}) values(${tokens.join(',')}) returning ${this.columns}`;
        else sql=`update public.${this.table} set ${fields.map((key,i)=>`"${key}"=${tokens[i]}`).join(',')}${where} returning ${this.columns}`;
      }
      try{const {rows}=await this.db.query(sql,params);resolve({data:this.one?rows[0]||null:rows,error:null});}catch(error){resolve({data:null,error});}
    }catch(error){reject(error);}
  }
}
