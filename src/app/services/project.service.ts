import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { MessageGroupDetailsResponseDto, MessageGroupListResponseDto, MessageUpsertDto, Project, ProjectCreateDto, ProjectUpdateDto, Team, TeamCreateDto, TeamMember, TeamMemberAddDto, TeamMemberUpdateDto, TeamUpdateDto, Thread, ThreadCreateDto, ThreadUpdateDto } from '../models/project-models';
import { MessageGroup } from '../models/models';

@Injectable({ providedIn: 'root' })
export class TeamService {
    private readonly authService: AuthService = inject(AuthService);
    private readonly http: HttpClient = inject(HttpClient);

    createTeam(team: TeamCreateDto): Observable<Team> {
        return this.http.post<Team>('/api/teams', team, { headers: this.authService.getHeaders() });
    }

    getTeamList(): Observable<Team[]> {
        return this.http.get<Team[]>('/api/teams', { headers: this.authService.getHeaders() });
    }

    getTeam(teamId: string): Observable<Team> {
        return this.http.get<Team>(`/api/teams/${teamId}`, { headers: this.authService.getHeaders() });
    }

    updateTeam(teamId: string, team: TeamUpdateDto): Observable<Team> {
        return this.http.put<Team>(`/api/teams/${teamId}`, team, { headers: this.authService.getHeaders() });
    }

    deleteTeam(teamId: string): Observable<void> {
        return this.http.delete<void>(`/api/teams/${teamId}`, { headers: this.authService.getHeaders() });
    }

    addTeamMember(teamId: string, member: TeamMemberAddDto): Observable<TeamMember> {
        return this.http.post<TeamMember>(`/api/teams/${teamId}/members`, member, { headers: this.authService.getHeaders() });
    }

    getTeamMembers(teamId: string): Observable<TeamMember[]> {
        return this.http.get<TeamMember[]>(`/api/teams/${teamId}/members`, { headers: this.authService.getHeaders() });
    }

    updateTeamMember(teamId: string, memberId: string, member: TeamMemberUpdateDto): Observable<TeamMember> {
        return this.http.put<TeamMember>(`/api/teams/${teamId}/members/${memberId}`, member, { headers: this.authService.getHeaders() });
    }

    removeTeamMember(teamId: string, memberId: string): Observable<void> {
        return this.http.delete<void>(`/api/teams/${teamId}/members/${memberId}`, { headers: this.authService.getHeaders() });
    }
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
    private readonly authService: AuthService = inject(AuthService);
    private readonly http: HttpClient = inject(HttpClient);

    createProject(project: ProjectCreateDto): Observable<Project> {
        return this.http.post<Project>('/api/projects', project, { headers: this.authService.getHeaders() });
    }

    getProjectList(): Observable<Project[]> {
        return this.http.get<Project[]>('/api/projects', { headers: this.authService.getHeaders() });
    }

    getProject(projectId: string): Observable<Project> {
        return this.http.get<Project>(`/api/projects/${projectId}`, { headers: this.authService.getHeaders() });
    }

    updateProject(projectId: string, project: ProjectUpdateDto): Observable<Project> {
        return this.http.put<Project>(`/api/projects/${projectId}`, project, { headers: this.authService.getHeaders() });
    }

    deleteProject(projectId: string): Observable<void> {
        return this.http.delete<void>(`/api/projects/${projectId}`, { headers: this.authService.getHeaders() });
    }
}

@Injectable({ providedIn: 'root' })
export class ThreadService {
    private readonly authService: AuthService = inject(AuthService);
    private readonly http: HttpClient = inject(HttpClient);

    createThread(projectId: string, thread: ThreadCreateDto): Observable<Thread> {
        return this.http.post<Thread>(`/api/projects/${projectId}/threads`, thread, { headers: this.authService.getHeaders() });
    }

    getThreadList(projectId: string): Observable<Thread[]> {
        return this.http.get<Thread[]>(`/api/projects/${projectId}/threads`, { headers: this.authService.getHeaders() });
    }

    getThread(threadId: string): Observable<Thread> {
        return this.http.get<Thread>(`/api/threads/${threadId}`, { headers: this.authService.getHeaders() });
    }

    updateThread(threadId: string, thread: ThreadUpdateDto): Observable<Thread> {
        return this.http.put<Thread>(`/api/threads/${threadId}`, thread, { headers: this.authService.getHeaders() });
    }

    deleteThread(threadId: string): Observable<void> {
        return this.http.delete<void>(`/api/threads/${threadId}`, { headers: this.authService.getHeaders() });
    }
}

@Injectable({ providedIn: 'root' })
export class MessageService {
    private readonly authService: AuthService = inject(AuthService);
    private readonly http: HttpClient = inject(HttpClient);

    upsertMessageWithContents(threadId: string, message: MessageUpsertDto): Observable<MessageGroup> {
        return this.http.post<MessageGroup>(`/api/threads/${threadId}/messages`, message, { headers: this.authService.getHeaders() });
    }

    getMessageGroupList(threadId: string, page: number = 1, limit: number = 20): Observable<MessageGroupListResponseDto> {
        return this.http.get<MessageGroupListResponseDto>(`/api/threads/${threadId}/message-groups`, {
            params: { page: page.toString(), limit: limit.toString() },
            headers: this.authService.getHeaders()
        });
    }

    getMessageGroupDetails(messageGroupId: string): Observable<MessageGroupDetailsResponseDto> {
        return this.http.get<MessageGroupDetailsResponseDto>(`/api/message-groups/${messageGroupId}`, { headers: this.authService.getHeaders() });
    }

    deleteMessageGroup(messageGroupId: string): Observable<void> {
        return this.http.delete<void>(`/api/message-groups/${messageGroupId}`, { headers: this.authService.getHeaders() });
    }

    deleteMessage(messageId: string): Observable<void> {
        return this.http.delete<void>(`/api/messages/${messageId}`, { headers: this.authService.getHeaders() });
    }
}