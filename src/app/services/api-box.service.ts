import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';


@Injectable({ providedIn: 'root' })
export class ApiBoxService {

  basePath = `/user/oauth/api/proxy/box`;
  
  private readonly http: HttpClient = inject(HttpClient);

  boxMe(): Observable<any> {
    const url = `${this.basePath}/2.0/users/me`;
    return this.http.get<any[]>(url);
  }

  boxUsers(id: string = '0'): Observable<any[]> {
    const url = `${this.basePath}/2.0/folders/${id}/items`;
    return this.http.get<any[]>(url);
  }
}